var vows    = require('vows'),
    assert  = require('assert'),
    async   = require('async'),
    moxi    = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', port : 11211 });

vows.describe('Store + MultiGet').addBatch({
    'Set "tes17" to "test1value"' : {
        'topic': function () {
            async.parallel([
                function (cb) {
                    client.set('tes171', 'tes171value', 5, cb);
                },
                function (cb) {
                    client.set('tes172', 'tes172value', 5, cb);
                },
                function (cb) {
                    client.set('tes173', 'tes173value', 5, cb);
                },
                function (cb) {
                    client.set('tes174', 'tes174value', 5, cb);
                }
            ], this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.deepEqual(data,  [ 'STORED', 'STORED', 'STORED', 'STORED' ]);
        },
        'read the value of "tes17"' : {
            'topic': function () {
                client.getMulti(['tes171', 'tes172', 'tes173', 'tes174'], this.callback);
            },
            'returns "tes17[1-4]value"' : function (data) {
                assert.deepEqual(data,  {
                    'tes171': 'tes171value',
                    'tes172': 'tes172value',
                    'tes173': 'tes173value',
                    'tes174': 'tes174value'
                });
            },
            'delete "tes17[1-4] values"' : {
                'topic': function () {
                    async.parallel([
                        function (cb) {
                            client.del('tes171', cb);
                        },
                        function (cb) {
                            client.del('tes172', cb);
                        },
                        function (cb) {
                            client.del('tes173', cb);
                        },
                        function (cb) {
                            client.del('tes174', cb);
                        }
                    ], this.callback);
                },
                'returns "DELETED"' : function (data) {
                    assert.deepEqual(data,  [ 'DELETED', 'DELETED', 'DELETED', 'DELETED' ]);
                },
                'read the value of "tes17[1-4]"' : {
                    'topic' : function () {
                        client.getMulti(['tes171', 'tes172', 'tes173', 'tes174'], this.callback);
                    },
                    'returns all keys as empty' : function (data) {
                        assert.deepEqual(data,  {});
                    }
                }
            }
        }
    }
}).export(module);
