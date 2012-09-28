#!/bin/sh

trap exit INT;

echo "-- JSON data -- "
for file in data/{simple,menu,widget,glossary,webapp}.json; do
    echo -n "node-memcached     : ";
    /nvm/v0.8.4/bin/node bench_node_memcached/read-write-json.js $file;

    echo -n "node-moxi          : ";
    /nvm/v0.8.4/bin/node bench/read-write-json.js $file;

    echo -n "node-moxi (msgpack): ";
    /nvm/v0.8.4/bin/node bench/read-write-msgpack.js $file;
    echo "";
done

echo "-- String data -- "
for file in data/{1,4,8,16,32}.dat; do
    echo -n "node-memcached: ";
    /nvm/v0.8.4/bin/node bench_node_memcached/read-write-filetext.js $file;

    echo -n "node-moxi     : ";
    /nvm/v0.8.4/bin/node bench/read-write-filetext.js $file;
    echo "";
done

echo "-- Binary data -- "
for file in data/{1,4,8,16,32}.dat; do
    echo -n "node-memcached: ";
    /nvm/v0.8.4/bin/node bench_node_memcached/read-write-filedata.js $file;

    echo -n "node-moxi     : ";
    /nvm/v0.8.4/bin/node bench/read-write-filedata.js $file;
    echo "";
done
