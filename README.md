# node-bzip

`node-bzip` is a pure-javascript Node.JS module adapted from antimatter15's pure-javascript implementation for decoding bzip2 data.  `node-bzip` currently only decodes buffers into other buffers, synchronously.

## How to Install

```
npm install node-bzip
```

## Usage

After compressing some example data into `example.bz2`, the following with recreate that original data and save it to `example`.

```
var decodeBzip = require('node-bzip');
var fs = require('fs');

var compressedData = fs.readFileSync('example.bz2');
var data = decodeBzip(compressedData);

fs.writeFileSync('example', data);
```

## Documentation

`require('node-bzip')` returns a function accepting one or two parameters:

`function decodeBzip(Buffer inputBuffer, [Number expectedSize])`

If `expectedSize` is not present, `decodeBzip` simply decodes `inputBuffer` and returns the resulting `Buffer`.

If `expectedSize` is present, `decodeBzip` will store the results in a `Buffer` of length `expectedSize`, and throw an error in the case that the size of the decoded data does not match `expectedSize`.

## Notices

Please note that this module is almost entirely *untested* and **should not be used in a production environment**!

## License

#### LGPL 2.1 License

```
Copyright &copy; 2012 Eli Skeggs

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
```
