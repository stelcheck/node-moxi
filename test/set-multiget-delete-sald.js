var vows   = require('vows'),
    assert = require('assert'),
    fs     = require('fs'),
    async   = require('async'),
    moxi   = require('../index.js');

var client      = new moxi.moxi({'host' : 'localhost', port : 11211 });
var imageData   = fs.readFileSync('./data/sean.jpg');
var textData    = fs.readFileSync('./data/512k.txt');

vows.describe('Store an Image and Large Text Data (512k data block)').addBatch({
    'Set "test12[1-4]" to different sized data' : {
        'topic': function () {
            async.parallel([
                function (cb) {
                    client.set('test121', textData, 5, cb);
                },
                function (cb) {
                    client.set('test122', 'bravo', 5, cb);
                },
                function (cb) {
                    client.set('test123', 'charlie', 5, cb);
                },
                function (cb) {
                    client.set('test124', imageData, 5, cb);
                }
            ], this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.deepEqual(data,  [ 'STORED', 'STORED', 'STORED', 'STORED' ]);
        },
        'read previously set values' : {
            'topic': function () {
                client.getMulti(['test121', 'test122', 'test123', 'test124'], this.callback);
            },
            'returns previously set values' : function (data) {
                assert.deepEqual(data.test121, textData);
                assert.equal(data.test122, 'bravo');
                assert.equal(data.test123, 'charlie');
                assert.deepEqual(data.test124, imageData);
            },
            'delete "test12[1-4] values"' : {
                'topic': function () {
                    async.parallel([
                        function (cb) {
                            client.del('test121', cb);
                        },
                        function (cb) {
                            client.del('test122', cb);
                        },
                        function (cb) {
                            client.del('test123', cb);
                        },
                        function (cb) {
                            client.del('test124', cb);
                        }
                    ], this.callback);
                },
                'returns "DELETED"' : function (data) {
                    assert.deepEqual(data,  [ 'DELETED', 'DELETED', 'DELETED', 'DELETED' ]);
                },
                'read the value of "test12[1-4]"' : {
                    'topic' : function () {
                        client.getMulti(['test121', 'test122', 'test123', 'test124'], this.callback);
                    },
                    'returns all keys as empty' : function (data) {
                        assert.deepEqual(data,  {});
                    }
                }
            }
        }
    }
}).export(module);
