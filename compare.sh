#!/bin/bash

trap exit INT;

echo "-- JSON data -- "
for file in data/{simple,menu,widget,glossary,webapp}.json; do
    echo -n "node-memcached (read)      : ";
    /nvm/v0.8.4/bin/node bench_node_memcached/read-write-json.js $file;

    echo -n "node-memcached (write)     : ";
    /nvm/v0.8.4/bin/node bench_node_memcached/write-json.js $file;

    echo -n "node-moxi (read)           : ";
    /nvm/v0.8.4/bin/node bench/read-write-json.js $file;
    echo -n "node-moxi (write)          : ";
    /nvm/v0.8.4/bin/node bench/write-json.js $file;

    echo -n "node-moxi / msgpack (read) : ";
    /nvm/v0.8.4/bin/node bench/read-write-msgpack.js $file;
    echo -n "node-moxi / msgpack (write): ";
    /nvm/v0.8.4/bin/node bench/write-msgpack.js $file;
    echo "";
done

echo "-- String data -- "
for file in data/{1,4,8,16,32}.dat; do
    echo -n "node-memcached (read) : ";
    /nvm/v0.8.4/bin/node bench_node_memcached/read-write-filetext.js $file;
    echo -n "node-memcached (write): ";
    /nvm/v0.8.4/bin/node bench_node_memcached/write-filetext.js $file;

    echo -n "node-moxi      (read) : ";
    /nvm/v0.8.4/bin/node bench/read-write-filetext.js $file;
    echo -n "node-moxi      (write): ";
    /nvm/v0.8.4/bin/node bench/write-filetext.js $file;
    echo "";
done

echo "-- Binary data -- "
for file in data/{1,4,8,16,32}.dat; do
    echo -n "node-memcached (read) : ";
    /nvm/v0.8.4/bin/node bench_node_memcached/read-write-filedata.js $file;
    echo -n "node-memcached (write): ";
    /nvm/v0.8.4/bin/node bench_node_memcached/write-filedata.js $file;

    echo -n "node-moxi      (read) : ";
    /nvm/v0.8.4/bin/node bench/read-write-filedata.js $file;
    echo -n "node-moxi      (write): ";
    /nvm/v0.8.4/bin/node bench/write-filedata.js $file;
    echo "";
done
