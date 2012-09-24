var vows   = require('vows'),
    assert = require('assert'),
    fs     = require('fs'),
    async   = require('async'),
    moxi   = require('../index.js');

var client      = new moxi.moxi({'host' : 'localhost', port : 11211 });
var textData    = fs.readFileSync('./data/512k.txt');
var imageData   = fs.readFileSync('./data/sean.jpg');

vows.describe('Store an Image and Large Text Data (512k data block)').addBatch({
    'Set "test8x" to large data sets' : {
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
            'returns "test1value"' : function (data) {
                assert.deepEqual(data.test81, textData);
                assert.deepEqual(data.test84, imageData);
            },
            'delete "test81-44 values"' : {
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
                'returns "test1value"' : function (data) {
                    assert.deepEqual(data,  [ 'DELETED', 'DELETED', 'DELETED', 'DELETED' ]);
                },
                'read the value of "test1", expect empty' : {
                    'topic' : function () {
                        client.getMulti(['test81', 'test82', 'test83', 'test84'], this.callback);
                    },
                    'returns all keys as empty' : function (data) {
                        assert.deepEqual(data,  {});
                    }
                }
            }
        }
    }
}).export(module);
