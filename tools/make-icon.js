// Generates the app icon (256x256 PNG, plus 1024x1024 for macOS) without any dependencies.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
function roundRectDist(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return Math.hypot(x - cx, y - cy) - r;
}

function render(S) {
const k = S / 256; // drawing is designed at 256px
const px = Buffer.alloc(S * S * 4);
for (let py = 0; py < S; py++) {
  for (let pxl = 0; pxl < S; pxl++) {
    const x = pxl / k, y = py / k;
    let r = 0, g = 0, b = 0, a = 0;
    // tilted rounded square like a Roblox block
    const ang = -12 * Math.PI / 180;
    const cx = x - 128, cy = y - 128;
    const rx = cx * Math.cos(ang) - cy * Math.sin(ang) + 128;
    const ry = cx * Math.sin(ang) + cy * Math.cos(ang) + 128;
    const d = roundRectDist(rx, ry, 34, 34, 222, 222, 38) * k;
    const cover = Math.max(0, Math.min(1, 0.5 - d));
    if (cover > 0) {
      const t = (x + y) / (2 * 256);
      r = 20 + 30 * t; g = 110 + 40 * (1 - t); b = 230 - 20 * t; a = cover;
      // chevrons "< >" and slash
      const w = 11;
      const strokes = [
        segDist(x, y, 102, 92, 70, 128), segDist(x, y, 70, 128, 102, 164),
        segDist(x, y, 154, 92, 186, 128), segDist(x, y, 186, 128, 154, 164),
        segDist(x, y, 140, 80, 116, 176),
      ];
      const sd = (Math.min(...strokes) - w) * k;
      const sc = Math.max(0, Math.min(1, 0.5 - sd));
      r = r * (1 - sc) + 255 * sc; g = g * (1 - sc) + 255 * sc; b = b * (1 - sc) + 255 * sc;
    }
    const i = (py * S + pxl) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = Math.round(a * 255);
  }
}
return encodePng(S, px);
}

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
function encodePng(S, px) {
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
return Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
}

const png = render(256);
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'icon.png'), png);
fs.writeFileSync(path.join(root, 'app', 'icon.png'), png);
fs.writeFileSync(path.join(root, 'build', 'icon-mac.png'), render(1024));
console.log('icon written');
