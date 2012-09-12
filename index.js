var net      = require('net'),
    deadpool = require('generic-pool');

var moxi = function (config, cb) {

    var poolName = [config.host, config.port].join(":");
    var pools    = moxi.pools;
    var pool     = moxi.pools[poolName];

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
            client.setEncoding('ascii');

            client.pool = pool;
        };

        config.destroy = function closeConnection(client) {
            client.destroy();
        };

        pool = deadpool.Pool(config);

        if (config.log) {
            pool.verbose   =  config.log.verbose ? config.log.verbose : console.debug;
            pool.info    =  config.log.info    ? config.log.info    : console.info;
            pool.warn    =  config.log.warn    ? config.log.warn    : console.warn;
            pool.error   =  config.log.error   ? config.log.error   : console.error;
        }
        else {
            pool.verbose =  console.log;
            pool.info    =  console.info;
            pool.warn    =  console.warn;
            pool.error   =  console.error;
        }

        moxi.pools[poolName] = pool;
    }

    this.pool = pool;
};

moxi.pools = {};
moxi.expects = {
    "store" : {
        "STORED"        : "verbose",
        "NOT_STORED"    : "warning",
        "EXISTS"        : "error",
        "NOT_FOUND"     : "error"
    },
    "retrieve" : {
        "END" : "verbose"
    },
    "del" : {
        "DELETED"       : "verbose",
        "NOT_FOUND"     : "warning"
    },
    "delta" : {
        "NOT_FOUND"     : "error",
    },
    "touch" : {
        "TOUCHED"       : "verbose",
        "NOT_FOUND"     : "warning"
    }
};

process.on('exit', function drainAllPools() {
    var pools = moxi.pools;

    for (var name in pools) {
        pools[name].destroyAllNow();
    }
});

moxi.prototype.get = function (key, cb) {
    return this._call(["get", key].join(" "), false, moxi.expects.retrieve, function processDataOutput (err, data) {

        if (err) {
            return cb(err, data);
        }

        var content = data.split('\n');
        var meta    = content.shift();
        content.pop();
        content.pop();

        content = content.join('\n');

        return cb(err, content);
    });
};

moxi.prototype.getMulti = function (keys, cb) {
    return this._call(keys.unshift("get").join(" "), false, moxi.expects.retrieve, function processMultiDataOutput (err,data) {

        if (err) {
            return cb(err, data);
        }

        cb(err, content);
    });
};

moxi.prototype.del = function (key, cb) {
    return this._call(["delete", key].join(" "), false, moxi.expects.del, cb);
};

moxi.prototype.touch = function (key, time, cb) {
    return this._call(["touch", key, time].join(" "), false, moxi.expects.touch, cb);
};

moxi.prototype.incr = function (key, delta, cb) {
    return this._call(["incr", key, delta].join(" "), false, moxi.expects.delta, cb);
};

moxi.prototype.decr = function (key, delta, cb) {
    return this._call(["decr", key, delta].join(" "), false, moxi.expects.delta, cb);
};

moxi.prototype.set = function (key, data, timeout, cb) {
    data = data.toString();
    return this._call(["set", key, "0", timeout, data.length].join(" "), data, moxi.expects.store, cb);
};

moxi.prototype.add = function (key, data, timeout, cb) {
    data = data.toString();
    return this._call(["add", key, "0", timeout, data.length].join(" "), data, moxi.expects.store, cb);
};

moxi.prototype.replace = function (key, data, timeout, cb) {
    data = data.toString();
    return this._call(["replace", key, "0", timeout, data.length].join(" "), data, moxi.expects.store, cb);
};

moxi.prototype.append = function (key, data, timeout, cb) {
    data = data.toString();
    return this._call(["append", key, "0", timeout, data.length].join(" "), data, moxi.expects.store, cb);
};

moxi.prototype.prepend = function (key, data, timeout, cb) {
    data = data.toString();
    return this._call(["prepend", key, "0", timeout, data.length].join(" "), data, moxi.expects.store, cb);
};

moxi.prototype._call = function (action, data, expect, cb) {

    var that = this;

    this.pool.acquire(function (err, client) {

        if (err) {
            return cb(err, client);
        }

        client.receivedData = "";

        var onDataReceived = client.on('data', function onDataReceived(data) {

            var lastLine;
            var receivedData;
            var transmissionCompleted = false;
            var err = false;

            this.receivedData += data;
            receivedData = this.receivedData;

            // Here we deal with general error messages
            if (receivedData.indexOf("ERROR") === 0) {
                that.pool.error("ERROR: This call was invalid", action);
                transmissionCompleted = true;
                err = true;
            }
            else if (receivedData.indexOf("CLIENT_ERROR") === 0) {
                that.pool.error("ERROR: This call was invalid", action);
                transmissionCompleted = true;
                err = true;
            }
            else if (receivedData.indexOf("SERVER_ERROR") === 0) {
                that.pool.error("ERROR: This call was invalid", action);
                transmissionCompleted = true;
                err = true;
            }
            else {

                lastLine = receivedData.split(/\r\n/).slice(-2).join("");

                for (var message in expect) {
                    if (lastLine.indexOf(message) === 0) {

                        that.pool[expect[message]]("action", action, "returned", message);

                        if (expect[message] === "error") {
                            err = true;
                        }

                        transmissionCompleted = true;
                    }
                }
            }

            // Once we get an end of transmission message, we release the connection
            // and return the data (and error if applicable)
            if (transmissionCompleted) {
                this.removeListener('data', onDataReceived);
                that.pool.release(this);
                cb(err, receivedData);
            }
        });

        client.write(action + "\r\n");

        if(data) {
            client.write(data + "\r\n");
        }
    });
};

exports.moxi = moxi;
