#!/bin/sh

for file in $(ls ./data/ | sort -n | grep ".dat\$"); do
    node ./bench/read-write-filedata.js ./data/${file};
done
