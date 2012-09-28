require('buffertools');

var net      = require('net'),
    util     = require('util'),
    events   = require('events'),
    deadpool = require('generic-pool');

var moxi = function (config) {

    var poolName = [config.host, config.port].join(':');
    var pools    = moxi.pools;
    var pool     = moxi.pools[poolName];
    var configLog = config.log;

    if (!pool) {

        config.name = poolName;

        config.create = function createConnection(callback) {

            var client = net.createConnection(config.port, config.host);

            // On connect callback
            client.on('connect', function connect() {
                return callback(null, client);
            });

            // On error. We have connection error cases
            // as well as closed connection problems,
            // Which should have two different behaviour
            client.on('error', function handleError(err) {

                this.pool.destroy(this);

                // If we get a connection refused, we call
                // the callback with an error message
                if (err.errno === 111) {
                    return callback(err, null);
                }

                this.pool.error('ERROR: ', err);
            });

            // Will need further thinking
            // on this one...
            client.on('timeout', function handleError(err) {
                this.pool.error('TIMEOUT: ', err);
                this.pool.destroy(this);
            });

            client.setNoDelay(true);

            client.pool = pool;
        };

        // destroy the client on destroy
        config.destroy = function closeConnection(client) {
            client.destroy();
        };

        config.log = null;
        pool = moxi.pools[poolName] = this._setLogging(deadpool.Pool(config), configLog);
    }

    this.pool = pool;
    util.inherits(this, events.EventEmitter);
};

// All pools. This is a global var for all moxi instance
moxi.pools = {};

// Expected return codes for supported calls
moxi.prototype.expects = {
    'store' : {
        'STORED'        : 'verbose',
        'NOT_STORED'    : 'warn',
        'EXISTS'        : 'error',
        'NOT_FOUND'     : 'error'
    },
    'retrieve' : {
        'END' : 'verbose'
    },
    'del' : {
        'DELETED'       : 'verbose',
        'NOT_FOUND'     : 'warn'
    },
    'delta' : {
        'NOT_FOUND'     : 'error',
    },
    'touch' : {
        'STORED'       : 'verbose',
        'TOUCHED'       : 'verbose',
        'NOT_FOUND'     : 'warn'
    },
    'flush' : {
        'OK' : 'warn'
    }
};

moxi.prototype.bufferCode = {
    'VALUE' : new Buffer('VALUE'),
};
// These are errors which can apply to
// everyone; we add them to the expect object


for(var key in moxi.prototype.expects) {
    moxi.prototype.expects[key].ERROR           = 'error';
    moxi.prototype.expects[key].CLIENT_ERROR    = 'error';
    moxi.prototype.expects[key].SERVER_ERROR    = 'error'

    for (var subkey in moxi.prototype.expects[key]) {
        moxi.prototype.bufferCode[subkey] = new Buffer(subkey);
        moxi.prototype.bufferCode[subkey + '\r\n'] = new Buffer(subkey + '\r\n');
    }
};


// Flags, taken out of node-memcached
moxi.prototype.FLAGS = {
    'BINARY'    : 2<<1,
    'JSON'      : 1<<1
};

// On exit, drain pool
process.on('exit', function drainAllPools() {
    var pools = moxi.pools;

    for (var name in pools) {
        pools[name].destroyAllNow();
    }
});

// Starting here, a list of calls doable with this module
moxi.prototype.get = function (key, cb) {
    var that = this;
    return this._call(['get', key], false, this.expects.retrieve, function processDataOutput(err, data) {

        if (err) {
            return cb(err, data);
        }

        var content = data.split('\r\n');
        var meta    = content.shift().substr(6).split(" ");

        content.pop();
        content = content.join('\r\n');
        content = that._unserialize(content, meta);

        return cb(err, content);
    });
};

moxi.prototype.multi = moxi.prototype.getMulti = function (keys, cb) {

    var that = this;
    keys.unshift('get');

    return this._call(keys, false, this.expects.retrieve, function processMultiDataOutput(err, data) {

        if (err || data === 'END') {
            return cb(err, {});
        }

        var dataArray = data.split("\r\nVALUE ");
        var res = {};
        var meta = "";
        var key;

        for (var pos = 0; pos < dataArray.length; pos++) {
            var content = dataArray[pos].split('\r\n');

            if (pos === 0) {
                meta    = content.shift().substr(6).split(" ");
            }
            else {
                meta    = content.shift().split(" ");
            }

            if (pos === dataArray.length - 1) {
                content.pop();
            }

            key         = meta[0];
            content     = content.join('\r\n');
            res[key]    = that._unserialize(content, meta);
        }

        cb(err, res);
    });
};

moxi.prototype.del = function (key, cb) {
    return this._call(['delete', key], false, this.expects.del, cb);
};

moxi.prototype.touch = function (key, time, cb) {
    return this._call(['touch', key, time], false, this.expects.touch, cb);
};

moxi.prototype.increment = moxi.prototype.incr = function (key, delta, cb) {
    return this._call(['incr', key, delta], false, this.expects.delta, cb);
};

moxi.prototype.decrement = moxi.prototype.decr = function (key, delta, cb) {
    return this._call(['decr', key, delta], false, this.expects.delta, cb);
};

moxi.prototype.set = function (key, data, timeout, cb) {
    var info = this._serialize(data);
    return this._call(['set', key, info[1], timeout, info[2]], info[0], this.expects.store, cb);
};

moxi.prototype.add = function (key, data, timeout, cb) {
    var info = this._serialize(data);
    return this._call(['add', key, info[1], timeout, info[2]], info[0], this.expects.store, cb);
};

moxi.prototype.replace = function (key, data, timeout, cb) {
    var info = this._serialize(data);
    return this._call(['replace', key, info[1], timeout, info[2]], info[0], this.expects.store, cb);
};

moxi.prototype.append = function (key, data, timeout, cb) {
    var info = this._serialize(data);

    if (info[1] === this.FLAGS.JSON) {
        return cb({message: 'cannot append on json data'});
    }

    return this._call(['append', key, info[1], timeout, info[2]], info[0], this.expects.store, cb);
};

moxi.prototype.prepend = function (key, data, timeout, cb) {
    var info = this._serialize(data);

    if (info[1] === this.FLAGS.JSON) {
        return cb({message: 'cannot append on json data'});
    }

    return this._call(['prepend', key, info[1], timeout, info[2]], info[0], this.expects.store, cb);
};

moxi.prototype.flush = moxi.prototype.flushAll = function (cb) {
    return this._call('flush_all', false, this.expects.flush, cb);
};

moxi.prototype._call = function (action, data, expect, cb) {

    var that = this;
    var command = action[0];

    var actionStr = action.join(" ");

    this.pool.acquire(function (err, client) {

        if (err) {
            return cb(err, client);
        }

        // Set some client metadata for this
        // current call
        client.receivedData     = new Buffer(0);
        client.callBuffer       = new Buffer(5);
        client.leftToReceive    = 0;
        client.firstLineChecked = false;
        client.remainderBuffer  = null; // Buffer object

        // Data reception
        var onDataReceived = client.on('data', function onDataReceived(data) {

            // Appending to buffer, setting the data which
            // we have to parse on this round
            this.receivedData = Buffer.concat([this.receivedData, data], data.length + this.receivedData.length);

            if (this.remainderBuffer) {
                data = Buffer.concat([this.remainderBuffer, data], data.length + this.remainderBuffer.length);
            }

            // Variable definition
            var dataSize                = data.length;
            var receivedData            = this.receivedData;
            var transmissionCompleted   = false;
            var err                     = false;
            var leftToReceive           = this.leftToReceive;

            // Don't bother checking the outcome, we still have data to receive
            // data has been stacked, let's just move along
            if (leftToReceive - dataSize > 0) {
                leftToReceive = this.leftToReceive -= dataSize;
                that.pool.verbose(dataSize + ' received ::', this.leftToReceive + ' data left to receive for action', action);
                return;
            }

            // Here we deal with the first line (any return but VALUE)
            // We deal with errors, increment/decrement returns and
            // return messages which are defined in the list of expected
            // return messages
            // Note: we assume that the buffer size will always be bigger than a first line response
            if (!this.firstLineChecked) {

                // If we are doing increment/
                if (command === 'incr' || command === 'decr') {
                    transmissionCompleted = true;
                }

                // Check for expected end-of-command
                // Depending on the command type
                // Note that we expect a get or multiget returning no
                // data to pass by here
                for (var message in expect) {
                    if (receivedData.length > message.length && receivedData.slice(0, message.length).equals(that.bufferCode[message])) {

                        that.pool[expect[message]]('action', action, 'returned', message);

                        if (expect[message] === 'error') {
                            err = { message: 'Error / Invalid output code', code : message };
                            console.log(receivedData.toString(), "::", message)
                        }

                        transmissionCompleted = true;
                    }
                }

                // No need to check the first line again
                this.firstLineChecked = true;
            }

            // We have remaining data to consume;
            // we are getting more data, and have done a get. Lets
            // parse the data we get
            if (!transmissionCompleted) {

                // you should be able to receive buffer instead of string
                var buffer           = data.slice(this.leftToReceive);
                var bufferSize       = buffer.length;

                buffer.copy(this.callBuffer, 0, 0, 5);
                var callBuffer      = this.callBuffer;

                var dataLength       = 0;
                var metaDataLength   = 0;

                // If the last message is END, we have
                // no other value to consume
                // and we dont loop.
                if (callBuffer.equals(that.bufferCode['END\r\n'])) {
                    that.pool[expect.END]('action', action, 'returned END');
                    transmissionCompleted = true;
                }
                else {
                    while (callBuffer.equals('VALUE')) {

                        pos             = buffer.indexOf('\r');
                        metaData        = buffer.slice(6,pos).toString().split(' ');
                        dataLength      = parseInt(metaData[2]);
                        metaDataLength  = pos+2;

                        // Here we deal with not completely received data
                        // In this case, we
                        if (dataLength + metaDataLength > bufferSize) {
                            this.leftToReceive = dataLength + metaDataLength - bufferSize + 2;
                            that.pool.verbose(dataLength + ' data size ::', this.leftToReceive + ' data left to receive, waiting for the rest...', action);
                            return;
                        }

                        // Here we deal with small reads which should come in all at once.
                        // In this case, the while-loop should basically consume all data until
                        // we either hit END or a data chunk larger than the expected dataSize

                        // Consume the data
                        buffer       = buffer.slice(metaDataLength + dataLength + 2);
                        bufferSize   = buffer.length;
                        buffer.copy(callBuffer, 0, 0, 5);

                        // Once the data is consumed, we should have either VALUE or END

                        // If the remainder of the buffer matched exactly
                        // the expected data length, we break out. We
                        // expect to receive more data on another batch
                        if (bufferSize === 0){
                            return;
                        }
                        // If VALUE, continue the loop
                        else if (callBuffer.equals(that.bufferCode.VALUE)) {
                            that.pool.verbose('data end, receiving new value for action', action);
                            continue;
                        }
                        // If END, transmission is completed correctly, were done
                        else if (callBuffer.equals(that.bufferCode['END\r\n'])) {
                            that.pool[expect.END]('action', action, 'returned END');
                            transmissionCompleted = true;
                            break;
                        }
                    }

                    // This is for cases where we have fragment
                    // VALUE statement comming in; we pass them on
                    // to the next data reception
                    this.remainderBuffer = buffer;
                }
            }

            // Once we get an end of transmission message, we release the connection
            // and return the data (and error if applicable)
            if (transmissionCompleted) {
                // removing two chars \r\n at the end
                // removing listener on the connection
                // releasing the connection back in the pool

                receivedData = receivedData.toString(null, 0, receivedData.length - 2);
                this.removeListener('data', onDataReceived);
                that.pool.release(this);

                if (cb) {
                    cb(err, receivedData);
                }
            }
        });

        // Fire away call
        client.write(actionStr + '\r\n');

        // If data, fire away data
        if (data) {
            client.write(data + '\r\n');
        }
    });
};

moxi.prototype._serialize = function (data) {

    var flag = 0;
    var length = 0;
    var dataType = typeof data;

    if (Buffer.isBuffer(data)) {
      flag = this.FLAGS.BINARY;
      data = data.toString('binary');
    } else if (dataType !== 'string' && dataType !== 'number') {
      flag = this.FLAGS.JSON;
      data = JSON.stringify(data);
    } else {
      data = data.toString();
    }

    return [data, flag, Buffer.byteLength(data)];
};

moxi.prototype._unserialize = function (data, meta) {
    switch (parseInt(meta[1])) {
        case this.FLAGS.JSON:
        data = JSON.parse(data);
        break;
        case this.FLAGS.BINARY:
        tmp = new Buffer(data.length);
        tmp.write(data, 0, 'binary');
        data = tmp;
        break;
        default:
        break;
    }

    return data;
};

moxi.prototype._setLogging = function (pool, configLog) {

    var logTypes = ['verbose', 'info', 'warn', 'error'];
    var logType;
    var logTypeDatatype;
    var emptyFunction = function () {};

    if (typeof(configLog) === 'object') {

        for (var i in logTypes) {

            logType = logTypes[i];
            logTypeDatatype = typeof(configLog[logType]);

            if (logTypeDatatype === 'function') {
                pool[logType] = configLog[logType];
                continue;
            }
            else if (logTypeDatatype === 'undefined') {
                pool[logType] = emptyFunction;
                continue;
            }

            switch (logType) {
            case 'verbose':
                pool.verbose = console.log;
                break;
            case 'info':
                pool.info = console.info;
                break;
            case 'warn':
                pool.warn = console.warn;
                break;
            case 'error':
                pool.error = console.error;
                break;
            default:
                console.warn('WARNING: configuration for logging', logType, 'has been set, but is not an available log channel');
            }
        }
    }
    else if (configLog === true) {
        pool.verbose =  console.log;
        pool.info    =  console.info;
        pool.warn    =  console.warn;
        pool.error   =  console.error;
    }
    else {
        pool.verbose = pool.info = pool.warn = pool.error = emptyFunction;
    }

    return pool;
};

exports.moxi = moxi;
