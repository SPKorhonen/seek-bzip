/*
node-bzip - a pure-javascript Node.JS module for decoding bzip2 data

Copyright (C) 2012 Eli Skeggs

This library is free software; you can redistribute it and/or
modify it under the terms of the GNU Lesser General Public
License as published by the Free Software Foundation; either
version 2.1 of the License, or (at your option) any later version.

This library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public
License along with this library; if not, see
http://www.gnu.org/licenses/lgpl-2.1.html

Adapted from bzip2.js, copyright 2011 antimatter15 (antimatter15@gmail.com).

Based on micro-bunzip by Rob Landley (rob@landley.net).

Based on bzip2 decompression code by Julian R Seward (jseward@acm.org),
which also acknowledges contributions by Mike Burrows, David Wheeler,
Peter Fenwick, Alistair Moffat, Radford Neal, Ian H. Witten,
Robert Sedgewick, and Jon L. Bentley.
*/

var BitReader = require('./bitreader');

var MAX_HUFCODE_BITS = 20;
var MAX_SYMBOLS = 258;
var SYMBOL_RUNA = 0;
var SYMBOL_RUNB = 1;
var GROUP_SIZE = 50;

var WHOLEPI = "314159265359";
var SQRTPI = "177245385090";

var mtf = function(array, index) {
  var src = array[index];
  for (var i = index; i > 0;)
    array[i] = array[--i];
  return array[0] = src;
};

var decode = function(inputbuffer, outputsize) {
  if (inputbuffer.toString(null, 0, 3) !== 'BZh')
    throw new TypeError('improper format');
  var level = inputbuffer[3] - 0x30;
  if (level < 1 || level > 9)
    throw new TypeError('level out of range');
  var reader = new BitReader(inputbuffer, 4);

  // meat of cow
  var bufsize = 100000 * level;
  var output = outputsize ? new Buffer(outputsize) : '';
  var nextoutput = 0;
  for (;;) {
    var h = reader.pi();
    if (h === SQRTPI) { // last block
      if (outputsize && nextoutput !== outputsize)
        throw new TypeError('outputsize does not match decoded input');
      return outputsize ? output : new Buffer(output);
    }
    if (h !== WHOLEPI)
      throw new TypeError('malformed bzip data');
    reader.read(32); // ignoring CRC codes; is this wise?
    if (reader.read(1))
      throw new TypeError('unsupported bzip version');
    var origPointer = reader.read(24);
    if (origPointer > bufsize)
      throw new TypeError('initial position out of bounds');
    var t = reader.read(16);

    var symToByte = new Buffer(256), symTotal = 0;
    for (var i = 0; i < 16; i++) {
      if (t & (1 << (0xF - i))) {
        var k = reader.read(16), o = i * 16;
        for (var j = 0; j < 16; j++)
          if (k & (1 << (0xF - j)))
            symToByte[symTotal++] = o + j;
      }
    }
    var symCount = symTotal + 2;

    var groupCount = reader.read(3);
    if (groupCount < 2 || groupCount > 6)
      throw new TypeError('malformed bzip data');
    var nSelectors = reader.read(15);
    if (nSelectors === 0)
      throw new TypeError('malformed bzip data');

    var mtfSymbol = []; // TODO: possibly replace with buffer?
    for (var i = 0; i < groupCount; i++)
      mtfSymbol[i] = i;

    var selectors = new Buffer(nSelectors); // was 32768...

    for (var i = 0; i < nSelectors; i++) {
      for (var j = 0; reader.read(1); j++)
        if (j >= groupCount)
          throw new TypeError('malformed bzip data');
      selectors[i] = mtf(mtfSymbol, j);
    }

    var groups = [];
    for (var j = 0; j < groupCount; j++) {
      var length = new Buffer(symCount), temp = new Buffer(MAX_HUFCODE_BITS + 1);
      t = reader.read(5); // lengths
      for (var i = 0; i < symCount; i++) {
        for (;;) {
          if (t < 1 || t > MAX_HUFCODE_BITS)
            throw new TypeError('malformed bzip data');
          if(!reader.read(1))
            break;
          if(!reader.read(1))
            t++;
          else
            t--;
        }
        length[i] = t;
      }

      var minLen,  maxLen;
      minLen = maxLen = length[0];
      for (var i = 1; i < symCount; i++) {
        if (length[i] > maxLen)
          maxLen = length[i];
        else if (length[i] < minLen)
          minLen = length[i];
      }

      var hufGroup = {};
      groups.push(hufGroup);
      hufGroup.permute = new Array(MAX_SYMBOLS); // UInt32Array
      hufGroup.limit = new Array(MAX_HUFCODE_BITS + 1); // UInt32Array
      hufGroup.base = new Array(MAX_HUFCODE_BITS + 1); // UInt32Array
      hufGroup.minLen = minLen;
      hufGroup.maxLen = maxLen;
      var pp = 0, i;
      for (i = minLen; i <= maxLen; i++)
        for (t = 0; t < symCount; t++)
          if (length[t] === i)
            hufGroup.permute[pp++] = t;
      for (i = minLen; i <= maxLen;)
        temp[i] = hufGroup.limit[++i] = 0;
      for (i = 0; i < symCount; i++)
        temp[length[i]]++;
      pp = t = 0;
      for (i = minLen; i < maxLen; i++) {
        pp += temp[i];
        hufGroup.limit[i + 1] = pp - 1;
        pp <<= 1;
        t += temp[i];
        hufGroup.base[i + 2] = pp - t;
      }
      hufGroup.limit[maxLen + 1] = pp + temp[maxLen] - 1;
      hufGroup.base[minLen + 1] = 0;
    }

    var byteCount = new Uint32Array(256); // Uint32Array
    for (var i = 0; i < 256; i++)
      mtfSymbol[i] = i;
    var runPos = 0, count = 0, symCount = 0, selector = 0, uc;
    var buf = new Array(bufsize); // Uint32Array
    for (;;) {
      if (!(symCount--)) {
        symCount = GROUP_SIZE - 1;
        if (selector >= nSelectors)
          throw new TypeError('malformed bzip data');
        hufGroup = groups[selectors[selector++]];
      }
      i = hufGroup.minLen
      j = reader.read(i);
      for (;;i++) {
        if (i > hufGroup.maxLen)
          throw new TypeError('malformed bzip data');
        if (j <= hufGroup.limit[i + 1])
          break;
        j = (j << 1) | reader.read(1);
      }
      j -= hufGroup.base[i + 1];
      if (j < 0 || j >= MAX_SYMBOLS)
        throw new TypeError('malformed bzip data');
      var nextSym = hufGroup.permute[j];
      if (nextSym === SYMBOL_RUNA || nextSym === SYMBOL_RUNB) {
        if (!runPos){
          runPos = 1;
          t = 0;
        }
        if (nextSym === SYMBOL_RUNA)
          t += runPos;
        else
          t += 2 * runPos;
        runPos <<= 1;
        continue;
      }
      if (runPos){
        runPos = 0;
        if (count + t >= bufsize)
          throw new TypeError('malformed bzip data');
        uc = symToByte[mtfSymbol[0]];
        byteCount[uc] += t;
        while (t--)
          buf[count++] = uc;
      }
      if (nextSym > symTotal)
        break;
      if (count >= bufsize)
        throw new TypeError('malformed bzip data');
      i = nextSym - 1;
      uc = mtfSymbol[i];
      mtfSymbol.splice(i, 1);
      mtfSymbol.splice(0, 0, uc);
      uc = symToByte[uc];
      byteCount[uc]++;
      buf[count++] = uc;
    }
    if (origPointer < 0 || origPointer >= count)
      throw new TypeError('malformed bzip data');
    var j = 0;
    for (var i = 0; i < 256; i++) {
      k = j + byteCount[i];
      byteCount[i] = j;
      j = k;
    }
    for (var i = 0; i < count; i++) {
      uc = buf[i] & 0xff;
      buf[byteCount[uc]] |= (i << 8);
      byteCount[uc]++;
    }
    var pos = 0, current = 0, run = 0;
    if (count) {
      pos = buf[origPointer];
      current = (pos & 0xff);
      pos >>= 8;
      run = -1;
    }
    //count = count;
    var copies, previous, outbyte;
    while (count) {
      count--;
      previous = current;
      pos = buf[pos];
      current = pos & 0xff;
      pos >>= 8;
      if (run++ === 3){
        copies = current;
        outbyte = previous;
        current = -1;
      } else {
        copies = 1;
        outbyte = current;
      }
      if (outputsize)
        while (copies--)
          output[nextoutput++] = outbyte;
      else
        while (copies--)
          output += String.fromCharCode(outbyte);
      if (current != previous)
        run = 0;
    }
  }
};

module.exports = decode;
