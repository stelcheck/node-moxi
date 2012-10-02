var vows = require('vows'),
    assert = require('assert'),
    moxi = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', port : 11211 });

vows.describe('Store').addBatch({
    'Set "test6" to "test6value"' : {
        'topic': function () {
            client.set('test6', 0, 10, this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.equal(data, 'STORED');
        },
        'increment by 2 "test6"' : {
            'topic': function () {
                client.incr('test6', 2, this.callback);
            },
            'returns "2"' : function (data) {
                assert.equal(data, '2');
            },
            'decrement "2"' : {
                'topic': function () {
                    client.decr("test6", 2, this.callback);
                },
                'returns "test6value"' : function (data) {
                    assert.equal(data, '0');
                },
                'delete and read the value of "test6"' : {
                    'topic' : function () {
                        var that = this;
                        client.del('test6', function () {
                            client.get('test6', that.callback);
                        });
                    },
                    'returns "test6value" as empty' : function (data) {
                        assert.equal(data, '');
                    }
                }
            }
        }
    }
}).export(module);
