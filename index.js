require('buffertools');

var net      = require('net'),
    util     = require('util'),
    events   = require('events'),
    msgpack  = require('msgpack'),
    processor= require('./lib/processor'),
    deadpool = require('generic-pool');

var moxi = function (config) {

    var poolName = [config.host, config.port].join(':');
    var pools    = moxi.pools;
    var pool     = moxi.pools[poolName];
    var configLog = config.log;
    var that     = this;

    this.config = config;

    if (!pool) {

        config.name = poolName;

        config.create = function createConnection(callback) {

            var client          = net.createConnection(config.port, config.host);

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

            client.pool         = pool;
            client.processor    = new processor.Processor(that, client);
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
for (var key in moxi.prototype.expects) {
    moxi.prototype.expects[key].ERROR           = 'error';
    moxi.prototype.expects[key].CLIENT_ERROR    = 'error';
    moxi.prototype.expects[key].SERVER_ERROR    = 'error';

    for (var subkey in moxi.prototype.expects[key]) {
        moxi.prototype.bufferCode[subkey] = new Buffer(subkey);
        moxi.prototype.bufferCode[subkey + '\r\n'] = new Buffer(subkey + '\r\n');
    }
}


// Flags, taken out of node-memcached
moxi.prototype.FLAGS = {
    'MSGPACK'   : 3<<1,
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

    var actionStr = action.join(" "); // transform to buffer

    this.pool.acquire(function (err, client) {

        if (err) {
            return cb(err, client);
        }

        client.processor.set(action, expect, cb);

        client.on('data', function (data) {
            client.processor.onDataReceived(data);
        });

        // Fire away call
        client.write(actionStr + '\r\n');

        // If data, fire away data
        if (data) {
            client.write(data);
            client.write('\r\n');
        }
    });
};

moxi.prototype._serialize = function (data) {

    var flag = 0;
    var length = 0;
    var dataType = typeof data;

    if (Buffer.isBuffer(data)) {
        flag = this.FLAGS.BINARY;
        length = data.length;
    } else if (dataType !== 'string' && dataType !== 'number') {
        if (this.config.msgpack) {
            flag    = this.FLAGS.MSGPACK;
            data    = msgpack.pack(data);
            length  = data.length;
        }
        else {
            flag    = this.FLAGS.JSON;
            data    = JSON.stringify(data);
        }
    } else {
        data = data.toString();
    }

    if (length === 0) {
        length = Buffer.byteLength(data);
    }

    return [data, flag, length];
};

moxi.prototype._unserialize = function (data, meta) {
    switch (parseInt(meta[1])) {
    case this.FLAGS.MSGPACK:
        return msgpack.unpack(data);
    case this.FLAGS.JSON:
        return JSON.parse(data.toString('binary'));
    case this.FLAGS.BINARY:
        return data;
    default:
        return data.toString();
    }
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
