// Generates PWA icons (a simple fox face on a dark circle) as PNGs with zero dependencies.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function inTri(px, py, a, b, c) {
  const s = (a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (px - c[0]);
  const t = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
  if ((s < 0) !== (t < 0) && s !== 0 && t !== 0) return false;
  const d = (c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (px - b[0]);
  return d === 0 || (d < 0) === (s + t <= 0);
}

function draw(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const s = size, cx = s / 2, cy = s / 2;
  const pad = maskable ? 0 : 0.04;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s;
    let r = 18, g = 10, b = 6, a = 255;
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (!maskable && d > 0.5 - pad) { a = 0; }
    // fox face: orange rounded head + ears + white muzzle + eyes
    const head = Math.sqrt((dx / 0.30) ** 2 + ((dy - 0.05) / 0.26) ** 2) < 1;
    const earL = inTri(u, v, [0.24, 0.42], [0.20, 0.14], [0.45, 0.30]);
    const earR = inTri(u, v, [0.76, 0.42], [0.80, 0.14], [0.55, 0.30]);
    const muzzle = Math.sqrt((dx / 0.14) ** 2 + ((dy - 0.14) / 0.11) ** 2) < 1;
    const eyeL = Math.sqrt(((u - 0.40) / 0.035) ** 2 + ((v - 0.50) / 0.045) ** 2) < 1;
    const eyeR = Math.sqrt(((u - 0.60) / 0.035) ** 2 + ((v - 0.50) / 0.045) ** 2) < 1;
    const nose = Math.sqrt(((u - 0.5) / 0.035) ** 2 + ((v - 0.62) / 0.028) ** 2) < 1;
    const innerEarL = inTri(u, v, [0.27, 0.40], [0.24, 0.20], [0.41, 0.31]);
    const innerEarR = inTri(u, v, [0.73, 0.40], [0.76, 0.20], [0.59, 0.31]);
    if (a) {
      if (head || earL || earR) { r = 224; g = 110; b = 38; }
      if (innerEarL || innerEarR) { r = 60; g = 25; b = 14; }
      if (muzzle) { r = 246; g = 232; b = 210; }
      if (eyeL || eyeR) { r = 20; g = 12; b = 8; }
      if (nose) { r = 25; g = 14; b = 10; }
      // neon ring
      if (!maskable && d > 0.46 - pad && d < 0.485 - pad) { r = 255; g = 90; b = 140; }
    }
    const i = (y * s + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  }
  return png(s, s, buf);
}

fs.writeFileSync(path.join(outDir, 'icon-192.png'), draw(192, false));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), draw(512, false));
fs.writeFileSync(path.join(outDir, 'icon-512-maskable.png'), draw(512, true));
console.log('icons written to', outDir);
