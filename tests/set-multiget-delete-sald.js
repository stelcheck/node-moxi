var vows   = require('vows'),
    assert = require('assert'),
    fs     = require('fs'),
    async   = require('async'),
    moxi   = require('../index.js');

var client      = new moxi.moxi({'host' : 'localhost', port : 11211, log : true });
var imageData   = fs.readFileSync('./data/sean.jpg');
var textData    = fs.readFileSync('./data/512k.txt');

vows.describe('Store an Image and Large Text Data (512k data block)').addBatch({
    'Set "test12x" to large data sets' : {
        'topic': function () {
            async.parallel([
                function (cb) {
                    client.set('test121', 5, textData, cb);
                },
                function (cb) {
                    client.set('test122', 5, 'bravo', cb);
                },
                function (cb) {
                    client.set('test123', 5, 'charlie', cb);
                },
                function (cb) {
                    client.set('test124', 5, imageData, cb);
                }
            ], this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.deepEqual(data,  [ 'STORED', 'STORED', 'STORED', 'STORED' ]);
        },
        'read the value of "test12"' : {
            'topic': function () {
                client.getMulti(['test121', 'test122', 'test123', 'test124'], this.callback);
            },
            'returns "test1value"' : function (data) {
                assert.equal(data.test121, textData);
                assert.equal(data.test122, 'bravo');
                assert.equal(data.test123, 'charlie');
                assert.equal(data.test124, imageData);
            },
            'delete "test121-44 values"' : {
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
                'returns "test1value"' : function (data) {
                    assert.deepEqual(data,  [ 'DELETED', 'DELETED', 'DELETED', 'DELETED' ]);
                },
                'read the value of "test1", expect empty' : {
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
