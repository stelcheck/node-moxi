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

        return cb(err, data[key] || '');
    });
};

moxi.prototype.multi = moxi.prototype.getMulti = function (keys, cb) {

    var that = this;
    keys.unshift('get');

    return this._call(keys, false, this.expects.retrieve, cb);
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
        client.callBuffer       = new Buffer(5);
        client.leftToReceive    = 0;
        client.firstLineChecked = false;
        client.returnData       = {};
        client.currentKey       = null;
        client.remainderBuffer  = null; // Buffer object

        // Data reception
        var onDataReceived = client.on('data', function onDataReceived(data) {

            if (this.remainderBuffer) {
                data = Buffer.concat([this.remainderBuffer, data], data.length + this.remainderBuffer.length);
            }

            // Variable definition
            var dataSize                = data.length;
            var transmissionCompleted   = false;
            var err                     = false;
            var leftToReceive           = this.leftToReceive;

            // Don't bother checking the outcome, we still have data to receive
            // data has been stacked, let's just move along

            if (leftToReceive - dataSize > 0) {
                currentData = this.returnData[this.currentKey];
                this.returnData[this.currentKey] = Buffer.concat([currentData, data], currentData.length + dataSize);
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
                    this.returnData = data.slice(0, dataSize - 2);
                }

                // Check for expected end-of-command
                // Depending on the command type
                // Note that we expect a get or multiget returning no
                // data to pass by here
                for (var message in expect) {
                    if (data.length > message.length && data.slice(0, message.length).equals(that.bufferCode[message])) {

                        that.pool[expect[message]]('action', action, 'returned', message);

                        if (expect[message] === 'error') {
                            err = { message: data.toString(), code : message };
                        }

                        if (message === 'END') {
                            this.returnData = {};
                        }
                        else {
                            this.returnData = message;
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
                if (this.currentKey) {
                    currentData  = this.returnData[this.currentKey];
                    leftOverData = data.slice(0, this.leftToReceive -2);
                    this.returnData[this.currentKey] = Buffer.concat([currentData, leftOverData], currentData.length + leftOverData.length);
                    this.returnData[this.currentKey] = that._unserialize(this.returnData[this.currentKey], this.currentMetaData);
                    delete this.currentKey;
                }

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
                        this.currentKey = metaData[0];

                        // Here we deal with not completely received data
                        // In this case, we
                        if (dataLength + metaDataLength > bufferSize) {
                            this.returnData[this.currentKey] = buffer.slice(metaDataLength);
                            this.currentMetaData = metaData;
                            this.leftToReceive = dataLength + metaDataLength - bufferSize + 2;
                            that.pool.verbose(dataLength + ' data size ::', this.leftToReceive + ' data left to receive, waiting for the rest...', action);
                            return;
                        }

                        // Here we deal with small reads which should come in all at once.
                        // In this case, the while-loop should basically consume all data until
                        // we either hit END or a data chunk larger than the expected dataSize

                        // Consume the data
                        this.returnData[this.currentKey] = that._unserialize(buffer.slice(metaDataLength, metaDataLength + dataLength), metaData);
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

                this.removeListener('data', onDataReceived);
                ret = this.returnData;
                delete this.returnData;
                that.pool.release(this);

                if (cb) {
                    cb(err, ret);
                }

            }
        });

        // Fire away call
        client.write(actionStr + '\r\n', 'binary');

        // If data, fire away data
        if (data) {
            client.write(data + '\r\n', 'binary');
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

    return [data, flag, Buffer.byteLength(data, 'binary')];
};

moxi.prototype._unserialize = function (data, meta) {
    switch (parseInt(meta[1])) {
        case this.FLAGS.JSON:
        data = JSON.parse(data);
        break;
        case this.FLAGS.BINARY:
        break;
        default:
        data = data.toString();
        break;
    }

    return data;
};

moxi.prototype._setLogging = function (pool, configLog) {

    var logTypes = ['verbose', 'info', 'warn', 'error'];
    var logType;
    var logTypeDatatype;
    var emptyFunction = function () { return true; };

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
