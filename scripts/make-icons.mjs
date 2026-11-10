// Renders the app icon to PNG without any image library (tiny rasterizer + zlib).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const GREEN = hex('#3d6b4e'), BLUE = hex('#3f6fa8'), WHITE = [255, 255, 255],
  BALL = hex('#dbf03f'), SEAM = hex('#8ea514');

// Shapes in a 0..1 unit square; later shapes paint over earlier ones.
const rect = (x0, y0, x1, y1, c) => (x, y) => (x >= x0 && x <= x1 && y >= y0 && y <= y1 ? c : null);
const circle = (cx, cy, r, c) => (x, y) => ((x - cx) ** 2 + (y - cy) ** 2 <= r * r ? c : null);
const lw = 0.022;
const shapes = [
  rect(0, 0, 1, 1, GREEN),
  rect(0.26, 0.1, 0.74, 0.9, BLUE),
  // outer lines
  rect(0.26, 0.1, 0.74, 0.1 + lw, WHITE), rect(0.26, 0.9 - lw, 0.74, 0.9, WHITE),
  rect(0.26, 0.1, 0.26 + lw, 0.9, WHITE), rect(0.74 - lw, 0.1, 0.74, 0.9, WHITE),
  // singles sidelines
  rect(0.32, 0.1, 0.32 + lw * 0.8, 0.9, WHITE), rect(0.68 - lw * 0.8, 0.1, 0.68, 0.9, WHITE),
  // service lines + centre line
  rect(0.32, 0.31, 0.68, 0.31 + lw * 0.8, WHITE), rect(0.32, 0.69 - lw * 0.8, 0.68, 0.69, WHITE),
  rect(0.5 - lw * 0.4, 0.31, 0.5 + lw * 0.4, 0.69, WHITE),
  // net
  rect(0.2, 0.5 - lw * 0.6, 0.8, 0.5 + lw * 0.6, WHITE),
  // ball
  circle(0.66, 0.7, 0.115, SEAM), circle(0.66, 0.7, 0.098, BALL),
];

function render(size) {
  const SS = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
        let c = GREEN;
        for (const s of shapes) { const v = s(x, y); if (v) c = v; }
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = py * (size * 3 + 1) + 1 + px * 3, n = SS * SS;
      raw[o] = r / n; raw[o + 1] = g / n; raw[o + 2] = b / n;
    }
  }
  return png(size, raw);
}

function png(size, raw) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), render(size));
  console.log('wrote', name);
}
