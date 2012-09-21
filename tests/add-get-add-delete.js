var vows = require('vows'),
    assert = require('assert'),
    moxi = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', port : 11211 });

vows.describe('Store').addBatch({
    'Add "test14" as "test14value"' : {
        'topic': function () {
            client.add("test14", "test14value", 3, this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.equal(data, 'STORED');
        },
        'read the value of "test14"' : {
            'topic': function () {
                client.get("test14", this.callback);
            },
            'returns "test14value"' : function (data) {
                assert.equal(data, 'test14value');
            },
            'Add "test14" again (must fail)' : {
                'topic': function () {
                    client.add("test14", "test14value", 3, this.callback);
                },
                'returns "STORED"' : function (data) {
                    assert.equal(data, 'NOT_STORED');
                },
                'delete "test14"' : {
                    'topic': function () {
                        client.del("test14", this.callback);
                    },
                    'returns "test14value"' : function (data) {
                        assert.equal(data, 'DELETED');
                    },
                    'read the value of "test14", expect empty' : {
                        'topic' : function () {
                            client.get("test14", this.callback);
                        },
                        'returns "test14value" as empty' : function (data) {
                            assert.equal(data, '');
                        }
                    }
                }
            }
        }
    }
}).export(module);
