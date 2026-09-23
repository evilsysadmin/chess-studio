import { inflateSync } from 'node:zlib';

// Minimal dependency-free PNG decoder for 8-bit, non-interlaced RGB/RGBA
// PNGs -- exactly what Chromium's screenshot API produces. Not a general
// PNG decoder: throws on anything else (palette, 16-bit, interlaced, etc.)
// rather than silently mis-decoding it.
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Not a PNG file');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
      if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported PNG color type: ${colorType}`);
      if (interlace !== 0) throw new Error('Interlaced PNG not supported');
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4; // skip CRC
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let rawOffset = 0;
  const prevLine = Buffer.alloc(stride);
  let curLine = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    raw.copy(curLine, 0, rawOffset, rawOffset + stride);
    rawOffset += stride;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? curLine[x - channels] : 0;
      const b = prevLine[x];
      const c = x >= channels ? prevLine[x - channels] : 0;
      let value = curLine[x];
      if (filterType === 1) value = (value + a) & 0xff;
      else if (filterType === 2) value = (value + b) & 0xff;
      else if (filterType === 3) value = (value + Math.floor((a + b) / 2)) & 0xff;
      else if (filterType === 4) value = (value + paeth(a, b, c)) & 0xff;
      curLine[x] = value;
    }

    for (let x = 0; x < width; x++) {
      const srcIndex = x * channels;
      const dstIndex = (y * width + x) * 4;
      pixels[dstIndex] = curLine[srcIndex];
      pixels[dstIndex + 1] = curLine[srcIndex + 1];
      pixels[dstIndex + 2] = curLine[srcIndex + 2];
      pixels[dstIndex + 3] = channels === 4 ? curLine[srcIndex + 3] : 255;
    }

    curLine.copy(prevLine);
  }

  return { width, height, pixels };
}
