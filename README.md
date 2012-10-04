node-moxi
=========
[![Build Status](https://secure.travis-ci.org/stelcheck/node-moxi.png)](http://travis-ci.org/stelcheck/node-moxi)

An alternative for connecting to Couchbase through Moxi, based on node-pool

Documentation
--------------

### API

Unless indicated otherwise, all data callback must be functions such as:

```
function (err, data) {
}
```

* **err**  is an Error object;
* **data** is the returned data;

When sending data to be written (add, set, replace), the data
automatically gets serialized; Buffer objects gets sent/read down the pipe
without further serialization, which improves read/write speed.

### new moxi(config)

* **Returns** Moxi client object

Config should contain information pertaining to pooling, logging and so on.

```
{
    max : maximum number of resources to create at any given time
            optional (default=1)

    min : minimum number of resources to keep in pool at any given time
            if this is set > max, the pool will silently set the min
            to factory.max - 1
            optional (default=0)

    idleTimeoutMillis : max milliseconds a resource can go
                        unused before it should be destroyed
                        (default 30000)

    reapIntervalMillis : frequency to check for idle
                         resources (default 1000),

    log: true || {
        debug : true || function (msg) {}
        info  : true || function (msg) {}
        warn  : true || function (msg) {}
        error : true || function (msg) {}
    },
    msgpack: Use MSGPack instead of JSON (existing JSON data will be written back as MSGPack!)
}
```
### moxi.get(key, cb)

* **Returns**: The stored data

### moxi.multi([key1, key2, ... keyN], cb)

* **Returns**: A key-value object

### moxi.del(key, cb)

* **Returns**: The returned code (DELETED or NOT_FOUND)

### moxi.touch(key, timeout, cb)

* **Returns**: The returned code (STORED or NOT_FOUND)

**NOTE** the protocol documentation says we should be
receiving TOUCHED, not STORED, but this is not the case.
The code can and will return one of those correctly.

### moxi.increment(key, delta, cb)

* **Returns**: The result of the increment, or SERVER_ERROR if the value cannot be incremented

### moxi.decrement(key delta, cb)

* **Returns**: The result of the decrement, or SERVER_ERROR if the value cannot be incremented

### moxi.set(key, val, timeout, cb)

* **Returns**: The returned code (STORED)

### moxi.add(key, val, timeout, cb)

* **Returns**: The returned code (STORED or EXISTS)

### moxi.replace(key, val, timeout, cb)

* **Returns**: The returned code (STORED or NOT_FOUND)

### moxi.append(key, val, timeout, cb)

* **Returns**: The returned code (STORED or NOT_FOUND)

### moxi.prepend(key, val, timeout, cb)

* **Returns**: The returned code (STORED or NOT_FOUND)

### moxi.flush(cb)

* **Returns**: The returned code (OK)

### moxi.bundle(cb)

This is an extra feature; it allows, combined with release, to control the acquirement
and release of the underlying connection.

Use this carefully; it should be used only and only in cases where a series of
sequential calls are required.

You also must make sure to release the connection yourself.

Nice feature, but you have been warned.

* **Returns**: a new moxi client instance, which you will use to do your calls

### moxi.release()

Once all your calls within a moxi bundles are done, call moxi.release to release the underlying connection.

License
--------

MIT.
