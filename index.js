var net      = require('net'),
    deadpool = require('generic-pool');

var moxi = function (config, cb) {

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

process.on('exit', function drainAllPools() {
    var pools = moxi.pools;

    for (var name in pools) {
        pools[name].destroyAllNow();
    }
});

moxi.prototype.get = function (key, cb) {
    return this._call(['get', key], false, moxi.expects.retrieve, function processDataOutput(err, data) {

        if (err) {
            return cb(err, data);
        }

        var content = data.split('\r\n');
        var meta    = content.shift().substr(6).split(" ");
        content.pop();

        content = content.join('\r\n');

        return cb(err, content);
    });
};

moxi.prototype.multi = moxi.prototype.getMulti = function (keys, cb) {

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

            key = meta[0];
            res[key] = content.join('\r\n');
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

moxi.prototype.set = function (key, timeout, data, cb) {
    return this._call(['set', key, '0', timeout, Buffer.byteLength(data)], data, moxi.expects.store, cb);
};

moxi.prototype.add = function (key, timeout, data, cb) {
    data = data.toString();
    return this._call(['add', key, '0', timeout, Buffer.byteLength(data)], data, moxi.expects.store, cb);
};

moxi.prototype.replace = function (key, timeout, data, cb) {
    data = data.toString();
    return this._call(['replace', key, '0', timeout, Buffer.byteLength(data)], data, moxi.expects.store, cb);
};

moxi.prototype.append = function (key, timeout, data, cb) {
    data = data.toString();
    return this._call(['append', key, '0', timeout, Buffer.byteLength(data)], data, moxi.expects.store, cb);
};

moxi.prototype.prepend = function (key, timeout, data, cb) {
    data = data.toString();
    return this._call(['prepend', key, '0', timeout, Buffer.byteLength(data)], data, moxi.expects.store, cb);
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

            var dataSize                = Buffer.byteLength(data);
            var receivedData            = this.receivedData;
            var transmissionCompleted   = false;
            var err                     = false;
            var isFirstLineComplete     = receivedData.indexOf('\r\n') !== false;
            var leftToReceive;

            // Don't bother checking the outcome (NOT SURE... if this is safe)
            if (this.leftToReceive - dataSize > 0) {
                this.leftToReceive -= dataSize;
                this.pool.verbose(dataSize + ' received ::', this.leftToReceive + ' data left to receive for action', action)
                return;
            }
            console.log("passing", dataSize, this.leftToReceive, this.leftToReceive - dataSize);

            // Here we deal with general error messages
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

            // We are getting more data, and have done a get. Lets
            // parse the data we get
            if (!transmissionCompleted && command === 'get') {

                var buffer          = data.substr(this.leftToReceive);
                var fullBuffer      = buffer;
                var fullBufferSize  = Buffer.byteLength(fullBuffer);
                var pattern         = /VALUE [^\s]+ [0-9]+ ([0-9]+)\r\n/g;
                var dataLength      = 0;
                var extracted;

                while (extracted = pattern.exec(fullBuffer)) {

                    dataLength      = parseInt(extracted[1]);
                    metaDataLength  = Buffer.byteLength(extracted[0]);

                    if (dataLength >= fullBufferSize) {
                        buffer = buffer.substr(metaDataLength);
                        this.leftToReceive = dataLength - fullBufferSize + metaDataLength;
                        that.pool.verbose( dataLength + ' data size ::', this.leftToReceive + ' data left to receive, waiting for the rest...', action);
                        return;
                    }

                    buffer = buffer.substr(Buffer.byteLength(extracted[0]) + dataLength);

                    if (buffer.indexOf('\r\nVALUE') === 0) {
                        buffer = buffer.substr(2);
                        that.pool.verbose('data end, receiving new value for action', action);
                        continue;
                    }
                    else if (buffer.indexOf('\r\nEND') === 0) {
                        that.pool[expect['END']]('action', action, 'returned', message);
                        transmissionCompleted = true;
                        break;
                    }
                    else {
                        // Unexpected data, throw error
                        that.pool.error('Unexpected trailing data', action, buffer);
                        err = { message:'Unexpected trailing data', data: buffer };
                        transmissionCompleted = true;
                    }
                }
            }

            // Once we get an end of transmission message, we release the connection
            // and return the data (and error if applicable)
            if (transmissionCompleted) {

                receivedData = receivedData.substr(0, receivedData.length - 2);
                this.removeListener('data', onDataReceived);
                that.pool.release(this);

                if (cb) {
                    cb(err, receivedData);
                }
            }
        });

        client.leftToReceive = 0;
        client.firstLineChecked = false;
        client.write(actionStr + '\r\n');

        if (data) {
            client.write(data + '\r\n');
        }
    });
};

exports.moxi = moxi;
