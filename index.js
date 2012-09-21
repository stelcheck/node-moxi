var net      = require('net'),
    util     = require('util'),
    events   = require('events'),
    deadpool = require('generic-pool');

var moxi = function (config) {

    var poolName = [config.host, config.port].join(':');
    var pools    = moxi.pools;
    var pool     = moxi.pools[poolName];
    var configLog = config.log;
    var logTypes = ['verbose', 'info', 'warn', 'error'];
    var logType;
    var logTypeDatatype;
    var i;
    var emptyFunction = function () {};

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
            client.setEncoding('utf8');

            client.pool = pool;
        };

        config.destroy = function closeConnection(client) {
            client.destroy();
        };

        config.log = null;
        pool = deadpool.Pool(config);

        if (typeof(configLog) === 'object') {

            for (i in logTypes) {

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

        moxi.pools[poolName] = pool;
    }

    this.pool = pool;
    util.inherits(this, events.EventEmitter);
};


moxi.pools = {};
moxi.expects = {
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

moxi.FLAGS = {
    'BINARY'    : 2<<1,
    'JSON'      : 1<<1
};

process.on('exit', function drainAllPools() {
    var pools = moxi.pools;

    for (var name in pools) {
        pools[name].destroyAllNow();
    }
});

moxi.prototype.get = function (key, cb) {
    var that = this;
    return this._call(['get', key], false, moxi.expects.retrieve, function processDataOutput(err, data) {

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

    return this._call(keys, false, moxi.expects.retrieve, function processMultiDataOutput(err, data) {

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
    return this._call(['delete', key], false, moxi.expects.del, cb);
};

moxi.prototype.touch = function (key, time, cb) {
    return this._call(['touch', key, time], false, moxi.expects.touch, cb);
};

moxi.prototype.increment = moxi.prototype.incr = function (key, delta, cb) {
    return this._call(['incr', key, delta], false, moxi.expects.delta, cb);
};

moxi.prototype.decrement = moxi.prototype.decr = function (key, delta, cb) {
    return this._call(['decr', key, delta], false, moxi.expects.delta, cb);
};

moxi.prototype.set = function (key, data, timeout, cb) {
    var info = this._serialize(data);
    return this._call(['set', key, info[1], timeout, info[2]], info[0], moxi.expects.store, cb);
};

moxi.prototype.add = function (key, data, timeout, cb) {
    var info = this._serialize(data);
    return this._call(['add', key, info[1], timeout, info[2]], info[0], moxi.expects.store, cb);
};

moxi.prototype.replace = function (key, data, timeout, cb) {
    var info = this._serialize(data);
    return this._call(['replace', key, info[1], timeout, info[2]], info[0], moxi.expects.store, cb);
};

moxi.prototype.append = function (key, data, timeout, cb) {
    var info = this._serialize(data);

    if (info[1] === moxi.FLAGS.JSON) {
        return cb({message: 'cannot append on json data'});
    }

    return this._call(['append', key, info[1], timeout, info[2]], info[0], moxi.expects.store, cb);
};

moxi.prototype.prepend = function (key, data, timeout, cb) {
    var info = this._serialize(data);

    if (info[1] === moxi.FLAGS.JSON) {
        return cb({message: 'cannot append on json data'});
    }

    return this._call(['append', key, info[1], timeout, info[2]], info[0], moxi.expects.store, cb);
};

moxi.prototype.flush = moxi.prototype.flushAll = function (cb) {
    return this._call('flush_all', false, moxi.expects.flush, cb);
};

moxi.prototype._call = function (action, data, expect, cb) {

    var that = this;
    var command = action[0];

    var actionStr = action.join(" ");

    this.pool.acquire(function (err, client) {

        if (err) {
            return cb(err, client);
        }

        client.receivedData = '';

        var onDataReceived = client.on('data', function onDataReceived(data) {

            this.receivedData   += data;
            data = this.remainderBuffer + data;

            var dataSize                = Buffer.byteLength(data);
            var receivedData            = this.receivedData;
            var transmissionCompleted   = false;
            var err                     = false;
            var isFirstLineComplete     = receivedData.indexOf('\r\n') !== false;
            var leftToReceive;

            // Don't bother checking the outcome, we still have data to receive
            // data has been stacked, let's just move along
            if (this.leftToReceive - dataSize > 0) {
                this.leftToReceive -= dataSize;
                that.pool.verbose(dataSize + ' received ::', this.leftToReceive + ' data left to receive for action', action);
                return;
            }

            // Here we deal with the first line (any return but VALUE)
            // We deal with errors, increment/decrement returns and
            // return messages which are defined in the list of expected
            // return messages
            if (isFirstLineComplete && !this.firstLineChecked) {

                if (receivedData.indexOf('ERROR') === 0) {
                    that.pool.error('ERROR: This call was invalid', action);
                    transmissionCompleted = true;
                    err = { message: 'ERROR: This call was invalid', code : 'ERROR' };
                }
                else if (receivedData.indexOf('CLIENT_ERROR') === 0) {
                    that.pool.error('ERROR: This call was invalid', action);
                    transmissionCompleted = true;
                    err = { message: 'ERROR: This call was invalid', code : 'CLIENT_ERROR' };
                }
                else if (receivedData.indexOf('SERVER_ERROR') === 0) {
                    that.pool.error('ERROR: This call was invalid', action);
                    transmissionCompleted = true;
                    err = { message: 'ERROR: This call was invalid', code : 'SERVER_ERROR' };
                }
                // If increment or decrement, we are sure transmission is completed
                // once the first line is received; error messages are handled with the bottom
                // command
                else if (command === 'incr' || command === 'decr') {
                    transmissionCompleted = true;
                }

                // Check for expected end-of-command
                // Depending on the command type
                // Note that we expect a get or multiget returning no
                // data to pass by here
                for (var message in expect) {
                    if (receivedData.indexOf(message) === 0) {

                        that.pool[expect[message]]('action', action, 'returned', message);

                        if (expect[message] === 'error') {
                            err = { message: 'Invalid output code', code : message };
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

                var buffer           = (new Buffer(data)).slice(this.leftToReceive);
                var stringBuffer     = buffer.toString();
                var fullStringBuffer = stringBuffer;
                var bufferSize   = buffer.length;
                var pattern          = /\r?\n?VALUE [^\s]+ [0-9]+ ([0-9]+)\r\n/g;
                var dataLength       = 0;
                var metaDataLength   = 0;
                var extracted;

                // If the last message is END, we have
                // no other value to consume
                // and we dont loop.
                if (stringBuffer.indexOf('\r\nEND') === 0) {
                    that.pool[expect.END]('action', action, 'returned END');
                    transmissionCompleted = true;
                }
                else {
                    while (extracted = pattern.exec(fullStringBuffer)) {

                        dataLength      = parseInt(extracted[1]);
                        metaDataLength  = Buffer.byteLength(extracted[0]);

                        // Here we deal with not completely received data
                        // In this case, we
                        if (dataLength + metaDataLength > bufferSize) {
                            this.leftToReceive = dataLength + metaDataLength - bufferSize;
                            that.pool.verbose(dataLength + ' data size ::', this.leftToReceive + ' data left to receive, waiting for the rest...', action);
                            return;
                        }

                        // Here we deal with small reads which should come in all at once.
                        // In this case, the while-loop should basically consume all data until
                        // we either hit END or a data chunk larger than the expected dataSize

                        // Consume the data
                        try {
                            buffer = buffer.slice(metaDataLength + dataLength);
                        } catch (e) {
                            console.log(e, buffer.toString());
                        }

                        bufferSize = buffer.length;
                        stringBuffer = buffer.toString();

                        // Once the data is consumed, we should have either VALUE or END

                        // If the remainder of the buffer matched exactly
                        // the expected data length, we break out. We
                        // expect to receive more data on another batch
                        if (bufferSize === 0){
                            return;
                        }
                        // If VALUE, continue the loop
                        else if (stringBuffer.indexOf('\r\nVALUE') === 0) {
                            bufferSize = buffer.length;
                            stringBuffer = buffer.toString();
                            that.pool.verbose('data end, receiving new value for action', action);
                            continue;
                        }
                        // If END, transmission is completed correctly, were done
                        else if (stringBuffer.indexOf('\r\nEND') === 0) {
                            that.pool[expect.END]('action', action, 'returned END');
                            transmissionCompleted = true;
                            break;
                        }
                    }

                    // This is for cases where we have fragment
                    // VALUE statement comming in; we pass them on
                    // to the next data reception
                    this.remainderBuffer = stringBuffer;
                }
            }

            // Once we get an end of transmission message, we release the connection
            // and return the data (and error if applicable)
            if (transmissionCompleted) {

                receivedData = receivedData.substr(0, receivedData.length - 2);
                this.removeListener('data', onDataReceived);
                that.pool.release(this);

                // that.pool.verbose('passing data to callback', receivedData);
                if (cb) {
                    cb(err, receivedData);
                }
            }
        });

        // Set some client metadata for this
        // current call
        client.leftToReceive = 0;
        client.firstLineChecked = false;
        client.remainderBuffer = "";

        client.write(actionStr + '\r\n');

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
      flag = moxi.FLAGS.BINARY;
      data = data.toString('binary');
    } else if (dataType !== 'string' && dataType !== 'number') {
      flag = moxi.FLAGS.JSON;
      data = JSON.stringify(data);
    } else {
      data = data.toString();
    }

    return [data, flag, Buffer.byteLength(data)];
};

moxi.prototype._unserialize = function (data, meta) {
    switch (parseInt(meta[1])) {
        case moxi.FLAGS.JSON:
        data = JSON.parse(data);
        break;
        case moxi.FLAGS.BINARY:
        tmp = new Buffer(data.length);
        tmp.write(data, 0, 'binary');
        data = tmp;
        break;
        default:
        break;
    }

    return data;
};

exports.moxi = moxi;
