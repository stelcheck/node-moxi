require('buffertools');

var util     = require('util'),
    events   = require('events');

var processor = function (mc, client) {

    this.mc               = mc;
    this.pool             = mc.pool;
    this.client           = client;

    this.expect           = {};
    this.command          = '';
    this.firstLineChecked = false;
    this.returnData       = {};

    this.leftToReceive    = 0;
    this.metaData         = new Array(3);
    this.metaDataLength   = 0;

    this.buffer           = new Buffer('');

    this.cb               = function () {};
};

processor.prototype.set = function (action, expect, cb) {

    this.expect           = expect;
    this.command          = action[0];
    this.firstLineChecked = action === 'get';

    this.returnData       = {};

    this.leftToReceive    = 0;
    this.metaData[0]      = '';
    this.metaDataLength   = 0;

    this.buffer           = new Buffer('');

    this.cb               = cb;
};

processor.prototype.stashToBuffer = function (data) {
    var currentKey  = this.metaData[0],
        currentData = this.returnData[currentKey];

    this.returnData[currentKey]  = Buffer.concat([currentData, data], currentData.length + data.length);

    this.leftToReceive -= data.length;

    this.pool.verbose(data.length + ' received ::', this.leftToReceive + ' data left to receive for action', this.command);
    return;
};

processor.prototype.checkFirstLine = function (data) {

    var err = null;

    // If we are doing increment,
    // set the value, but keep going in case we have an
    // error situation
    if (this.command === 'incr' || this.command === 'decr') {
        return this.onDataCompleted(null, data.slice(0, data.length - 2));
    }

    // Check for expected end-of-command
    // Depending on the command type
    // Note this.mc we expect a get or multiget returning no
    // data to pass by here
    for (var message in this.expect) {
        if (data.length > message.length && data.slice(0, message.length).equals(message)) {

            this.pool[this.expect[message]]('action', this.command, 'returned', message);

            if (this.expect[message] === 'error') {
                err = { message: data.toString(), code : message };
            }

            else if (message === 'END') {
                return this.onDataCompleted();
            }

            return this.onDataCompleted(err, message);
        }
    }

    // No need to check the first line again
    this.firstLineChecked = true;
};

processor.prototype.extractMetaData = function () {

    var spos = 6,
        npos = 6,
        buffer = this.buffer,
        val,
        pos  = buffer.indexOf('\r');

    if (!pos) {
        return false;
    }

    for (var metaIndex = 0; metaIndex < 3; metaIndex++) {
        npos = buffer.indexOf(' ', spos);

        if (npos > pos || npos === -1) {
            npos = pos;
        }

        if (metaIndex === 0) {
            val = buffer.slice(spos, npos);
        }
        else {

            val = 0;

            for (var r = spos; r < npos; r++) {
                val = val * 10 + buffer[r] - 48;
            }
        }

        this.metaData[metaIndex] = val;
        spos = npos + 1;
    }

    this.metaDataLength  = pos + 2;

    return true;
};

processor.prototype.onDataReceived = function (data) {

    var buffer     = this.buffer,
        currentKey = this.metaData[0];

    if (buffer && buffer.length > 0) {
        data = Buffer.concat([buffer, data], data.length + buffer.length);
    }

    // Don't bother checking the outcome, we still have data to receive
    // data has been stacked, let's just move along

    if (this.leftToReceive - data.length > 0) {
        return this.stashToBuffer(data);
    }

    // Here we deal with the first line (any return but VALUE)
    // We deal with errors, increment/decrement returns and
    // return messages which are defined in the list of expected
    // return messages
    // Note: we assume this.mc the buffer size will always be bigger than a first line response
    if (!this.firstLineChecked && this.checkFirstLine(data)) {
        return;
    }

    // We have remaining data to consume;
    // we are getting more data, and have done a get. Lets
    // parse the data we get

    if (currentKey) {
        var currentData             = this.returnData[currentKey];
        var leftOverData            = data.slice(0, this.leftToReceive - 2);
        currentData             = Buffer.concat([currentData, leftOverData], currentData.length + leftOverData.length);

        this.returnData[currentKey]  = this.mc._unserialize(currentData, this.metaData);
    }

    // Slice on 0 is by an order of magnitude more expensive...
    if (this.leftToReceive > 0) {
        this.buffer     = data.slice(this.leftToReceive);
    }
    else {
        this.buffer = data;
    }

    var callBuffer = this.buffer.slice(0, 5);

    // If the last message is END, we have
    // no other value to consume
    // and we dont loop.
    if (callBuffer.equals(this.mc.bufferCode['END\r\n'])) {
        this.pool[this.expect.END]('action', this.command, 'returned END');
        return this.onDataCompleted();
    }
    else {
        return this.tokenizeIncoming(callBuffer);
    }
};

processor.prototype.tokenizeIncoming = function (callBuffer) {

    var bufferCode = this.mc.bufferCode;
    while (callBuffer.equals(bufferCode.VALUE)) {

        if (!this.extractMetaData()) {
            return;
        }

        var metaData        = this.metaData,
            metaDataLength  = this.metaDataLength,
            currentKey      = metaData[0],
            dataLength      = metaData[2],
            fullLength      = metaDataLength + dataLength,
            buffer          = this.buffer;

        // Here we deal with not completely received data
        // In this case, we
        if (fullLength > buffer.length) {
            this.returnData[currentKey] = buffer.slice(metaDataLength);
            this.leftToReceive          = fullLength - buffer.length + 2;

            this.buffer = null;

            return;
        }

        // Here we deal with small reads which should come in all at once.
        // In this case, the while-loop should basically consume all data until
        // we either hit END or a data chunk larger than the expected dataSize

        // Consume the data
        this.returnData[currentKey]  = this.mc._unserialize(buffer.slice(metaDataLength, fullLength), metaData);

        // Once the data is consumed, we should have either VALUE or END

        // If the remainder of the buffer matched exactly
        // the expected data length, we break out. We
        // expect to receive more data on another batch
        if (buffer.length < fullLength + 7) {
            this.buffer = buffer.slice(fullLength + 2);
            return;
        }

        callBuffer = buffer.slice(fullLength + 2, fullLength + 7);

        // If VALUE, continue the loop
        if (callBuffer.equals(bufferCode.VALUE)) {
            this.buffer       =  buffer = buffer.slice(fullLength + 2);
            continue;
        }

        // If END, transmission is completed correctly, were done
        if (callBuffer.equals(bufferCode['END\r\n'])) {
            return this.onDataCompleted();
        }
    }
};

processor.prototype.onDataCompleted = function (err, data) {

    var client = this.client;
    client.removeAllListeners('data');

    if (this.cb) {
        this.cb(err || this.err, data || this.returnData);
    }

    return true;
};

exports.Processor = processor;
