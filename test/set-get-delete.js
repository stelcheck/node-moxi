var vows = require('vows'),
    assert = require('assert'),
    moxi = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', port : 11211 });

vows.describe('Store').addBatch({
    'Set "test1" to "test1value"' : {
        'topic': function () {
            client.set('test1', 'test1value', 3, this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.equal(data, 'STORED');
        },
        'read the value of "test1"' : {
            'topic': function () {
                client.get('test1', this.callback);
            },
            'returns "test1value"' : function (data) {
                assert.equal(data, 'test1value');
            },
            'delete "test1"' : {
                'topic': function () {
                    client.del('test1', this.callback);
                },
                'returns "DELETED"' : function (data) {
                    assert.equal(data, 'DELETED');
                },
                'read the value of "test1", expect empty' : {
                    'topic' : function () {
                        client.get('test1', this.callback);
                    },
                    'returns "test1value" as empty' : function (data) {
                        assert.equal(data, '');
                    }
                }
            }
        }
    }
}).export(module);
