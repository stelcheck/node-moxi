var vows    = require('vows'),
    assert  = require('assert'),
    async   = require('async'),
    moxi    = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', port : 11211, msgpack: true });

vows.describe('Store + MultiGet').addBatch({
    'Set "tes16[1-4]" to "a"' : {
        'topic': function () {
            async.parallel([
                function (cb) {
                    client.set('tes161', {'tes161value': 1, 'a':  'string'}, 5, cb);
                },
                function (cb) {
                    client.set('tes162', {'tes162value': 1, 'a':  'string'}, 5, cb);
                },
                function (cb) {
                    client.set('tes163', {'tes163value': 1, 'a':  'string'}, 5, cb);
                },
                function (cb) {
                    client.set('tes164', {'tes164value': 1, 'a':  'string'}, 5, cb);
                }
            ], this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.deepEqual(data,  [ 'STORED', 'STORED', 'STORED', 'STORED' ]);
        },
        'read the value of "test1"' : {
            'topic': function () {
                client.getMulti(['tes161', 'tes162', 'tes163', 'tes164'], this.callback);
            },
            'returns "tes16[1-4]" as "a"' : function (data) {
                assert.deepEqual(data,  {
                    'tes161': {'tes161value': 1, 'a':  'string'},
                    'tes162': {'tes162value': 1, 'a':  'string'},
                    'tes163': {'tes163value': 1, 'a':  'string'},
                    'tes164': {'tes164value': 1, 'a':  'string'}
                });
            },
            'delete "tes161-44 values"' : {
                'topic': function () {
                    async.parallel([
                        function (cb) {
                            client.del('tes161', cb);
                        },
                        function (cb) {
                            client.del('tes162', cb);
                        },
                        function (cb) {
                            client.del('tes163', cb);
                        },
                        function (cb) {
                            client.del('tes164', cb);
                        }
                    ], this.callback);
                },
                'returns "DELETED"' : function (data) {
                    assert.deepEqual(data,  [ 'DELETED', 'DELETED', 'DELETED', 'DELETED' ]);
                },
                'read the value of "tes16[1-4]"' : {
                    'topic' : function () {
                        client.getMulti(['tes161', 'tes162', 'tes163', 'tes164'], this.callback);
                    },
                    'returns all keys as empty' : function (data) {
                        assert.deepEqual(data,  {});
                    }
                }
            }
        }
    }
}).export(module);
