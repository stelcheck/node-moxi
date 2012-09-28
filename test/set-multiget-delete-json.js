var vows    = require('vows'),
    assert  = require('assert'),
    async   = require('async'),
    moxi    = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', port : 11211 });

vows.describe('Store + MultiGet').addBatch({
    'Set "test1" to "test1value"' : {
        'topic': function () {
            async.parallel([
                function (cb) {
                    client.set('test41', {'test41value':1, 'a':'string'}, 5, cb);
                },
                function (cb) {
                    client.set('test42', {'test42value':1, 'a':'string'}, 5, cb);
                },
                function (cb) {
                    client.set('test43', {'test43value':1, 'a':'string'}, 5, cb);
                },
                function (cb) {
                    client.set('test44', {'test44value':1, 'a':'string'}, 5, cb);
                }
            ], this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.deepEqual(data,  [ 'STORED', 'STORED', 'STORED', 'STORED' ]);
        },
        'read the value of "test1"' : {
            'topic': function () {
                client.getMulti(['test41', 'test42', 'test43', 'test44'], this.callback);
            },
            'returns "test1value"' : function (data) {
                assert.deepEqual(data,  {
                    'test41': {'test41value':1, 'a':'string'},
                    'test42': {'test42value':1, 'a':'string'},
                    'test43': {'test43value':1, 'a':'string'},
                    'test44': {'test44value':1, 'a':'string'}
                });
            },
            'delete "test41-44 values"' : {
                'topic': function () {
                    async.parallel([
                        function (cb) {
                            client.del('test41', cb);
                        },
                        function (cb) {
                            client.del('test42', cb);
                        },
                        function (cb) {
                            client.del('test43', cb);
                        },
                        function (cb) {
                            client.del('test44', cb);
                        }
                    ], this.callback);
                },
                'returns "test1value"' : function (data) {
                    assert.deepEqual(data,  [ 'DELETED', 'DELETED', 'DELETED', 'DELETED' ]);
                },
                'read the value of "test1", expect empty' : {
                    'topic' : function () {
                        client.getMulti(['test41', 'test42', 'test43', 'test44'], this.callback);
                    },
                    'returns all keys as empty' : function (data) {
                        assert.deepEqual(data,  {});
                    }
                }
            }
        }
    }
}).export(module);
