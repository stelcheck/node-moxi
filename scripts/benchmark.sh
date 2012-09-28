#!/bin/bash

. ./scripts/colorize.sh

trap exit INT

all=1;
string=0
json=0
binary=0
msgpack=0

while getopts "sjbm" opt; do
    case $opt in
        s)
        string=1;
        all=0;
        ;;
        j)
        json=1;
        all=0;
        ;;
        b)
        binary=1;
        all=0;
        ;;
        m)
        msgpack=1;
        all=0;
        ;;
        \?)
        echo "Invalid option: -$OPTARG" >&2
        exit 1;
        ;;
    esac
done

if (( $string || $all )); then
    echo "";
    echo "==== Benchmarking String data ====" | yellow;
    echo "";
    for file in $(ls ./data/ | sort -n | grep ".dat\$"); do
        node ./bench/read-write-filetext.js ./data/${file};
    done
    echo "";
fi;

if (( $json || $all )); then
    echo "";
    echo "==== Benchmarking JSON data ====" | green;
    echo "";
    for file in $(du -a ./data/| sort -n | grep "json\$" | cut -f2); do
        node ./bench/read-write-json.js ${file};
    done
    echo "";
fi;

if (( $binary || $all )); then
    echo "";
    echo "==== Benchmarking Binary data ====" | blue | bold
    echo "";
    for file in $(ls ./data/ | sort -n | grep ".dat\$"); do
        node ./bench/read-write-filedata.js ./data/${file};
    done
    echo "";
fi;

if (( $msgpack || $all )); then
    echo "";
    echo "==== Benchmarking MSGPACK data ====" | cyan;
    echo "";
    for file in $(du -a ./data/| sort -n | grep "json\$" | cut -f2); do
        node ./bench/read-write-msgpack.js ${file};
    done
    echo "";
fi;

