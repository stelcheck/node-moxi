var vows   = require('vows'),
    assert = require('assert'),
    fs     = require('fs'),
    async   = require('async'),
    moxi   = require('../index.js');

var client      = new moxi.moxi({'host' : 'localhost', port : 11211 });
var textData    = fs.readFileSync('./data/512k.txt').toString();
var imageData   = fs.readFileSync('./data/sean.jpg');

vows.describe('Store an Image and Large Text Data (512k data block)').addBatch({
    'Set "test8[1-4]" to large data sets using (./data/{512k.txt,sean.jpg})' : {
        'topic': function () {
            async.parallel([
                function (cb) {
                    client.set('test81', textData, 5, cb);
                },
                function (cb) {
                    client.set('test82', imageData, 5, cb);
                },
                function (cb) {
                    client.set('test83', textData, 5, cb);
                },
                function (cb) {
                    client.set('test84', imageData, 5, cb);
                }
            ], this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.deepEqual(data,  [ 'STORED', 'STORED', 'STORED', 'STORED' ]);
        },
        'read the value of "test8"' : {
            'topic': function () {
                client.getMulti(['test81', 'test82', 'test83', 'test84'], this.callback);
            },
            'returns "test81" with 512k.txt string data and "test84" with sean.jpg binary data' : function (data) {
                assert.deepEqual(data.test81, textData);
                assert.deepEqual(data.test84, imageData);
            },
            'delete "test8[1-4] values"' : {
                'topic': function () {
                    async.parallel([
                        function (cb) {
                            client.del('test81', cb);
                        },
                        function (cb) {
                            client.del('test82', cb);
                        },
                        function (cb) {
                            client.del('test83', cb);
                        },
                        function (cb) {
                            client.del('test84', cb);
                        }
                    ], this.callback);
                },
                'returns "DELETED"' : function (data) {
                    assert.deepEqual(data,  [ 'DELETED', 'DELETED', 'DELETED', 'DELETED' ]);
                },
                'read the value of "test8[1-4]", expect empty' : {
                    'topic' : function () {
                        client.getMulti(['test81', 'test82', 'test83', 'test84'], this.callback);
                    },
                    'returns an empty object' : function (data) {
                        assert.deepEqual(data,  {});
                    }
                }
            }
        }
    }
}).export(module);
