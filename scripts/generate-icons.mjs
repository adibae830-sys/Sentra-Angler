import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Minimal pure-Node RGBA PNG encoder (no native deps required)
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function blendPixel(buf, width, height, x, y, r, g, b, a) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
  const idx = (iy * width + ix) * 4;
  const alpha = Math.max(0, Math.min(1, a));
  const inv = 1 - alpha;
  buf[idx] = Math.round(buf[idx] * inv + r * alpha);
  buf[idx + 1] = Math.round(buf[idx + 1] * inv + g * alpha);
  buf[idx + 2] = Math.round(buf[idx + 2] * inv + b * alpha);
  buf[idx + 3] = 255;
}

function drawCircle(buf, w, h, cx, cy, radius, r, g, b, alpha = 1) {
  const minX = Math.floor(cx - radius - 2);
  const maxX = Math.ceil(cx + radius + 2);
  const minY = Math.floor(cy - radius - 2);
  const maxY = Math.ceil(cy + radius + 2);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= radius - 0.5) {
        blendPixel(buf, w, h, x, y, r, g, b, alpha);
      } else if (dist < radius + 0.8) {
        const aa = Math.max(0, 1 - (dist - (radius - 0.5)) / 1.3);
        blendPixel(buf, w, h, x, y, r, g, b, alpha * aa);
      }
    }
  }
}

function drawSegment(buf, w, h, x1, y1, x2, y2, thickness, r, g, b, alpha = 1) {
  const rad = thickness / 2;
  const minX = Math.floor(Math.min(x1, x2) - rad - 2);
  const maxX = Math.ceil(Math.max(x1, x2) + rad + 2);
  const minY = Math.floor(Math.min(y1, y2) - rad - 2);
  const maxY = Math.ceil(Math.max(y1, y2) + rad + 2);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
      const px = x1 + t * dx;
      const py = y1 + t * dy;
      const dist = Math.hypot(x - px, y - py);
      if (dist <= rad - 0.5) {
        blendPixel(buf, w, h, x, y, r, g, b, alpha);
      } else if (dist < rad + 0.8) {
        const aa = Math.max(0, 1 - (dist - (rad - 0.5)) / 1.3);
        blendPixel(buf, w, h, x, y, r, g, b, alpha * aa);
      }
    }
  }
}

function renderIcon(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  // Fill Navy #0B192C with subtle top-right gradient
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const grad = (x / size) * 0.35 + (1 - y / size) * 0.35;
      buf[idx] = Math.round(11 + grad * 10);
      buf[idx + 1] = Math.round(25 + grad * 18);
      buf[idx + 2] = Math.round(44 + grad * 28);
      buf[idx + 3] = 255;
    }
  }

  const scale = maskable ? size * 0.72 : size * 0.92;
  const offset = (size - scale) / 2;
  const sx = (v) => offset + (v / 512) * scale;
  const sw = (v) => (v / 512) * scale;

  // Subtle compass ring
  const cx = sx(256);
  const cy = sx(248);
  const ringR = sw(142);
  const ringW = sw(12);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.abs(Math.hypot(x - cx, y - cy) - ringR);
      if (d <= ringW / 2) {
        blendPixel(buf, size, size, x, y, 255, 255, 255, 0.14);
      }
    }
  }

  // Orange wave curve (sampled segments)
  const wavePts = [
    [130, 340],
    [164, 316],
    [198, 316],
    [234, 340],
    [270, 362],
    [306, 362],
    [342, 340],
    [382, 318],
  ];
  for (let i = 0; i < wavePts.length - 1; i++) {
    drawSegment(
      buf,
      size,
      size,
      sx(wavePts[i][0]),
      sx(wavePts[i][1]),
      sx(wavePts[i + 1][0]),
      sx(wavePts[i + 1][1]),
      sw(24),
      249,
      115,
      22,
      1
    );
  }

  // White fishing hook shaft + curve + barb
  drawSegment(buf, size, size, sx(256), sx(116), sx(256), sx(274), sw(26), 255, 255, 255, 1);
  const steps = 28;
  for (let i = 0; i < steps; i++) {
    const a1 = (i / steps) * Math.PI;
    const a2 = ((i + 1) / steps) * Math.PI;
    const hx = 196;
    const hy = 274;
    const hr = 60;
    drawSegment(
      buf,
      size,
      size,
      sx(hx + Math.cos(a1) * hr),
      sx(hy + Math.sin(a1) * hr),
      sx(hx + Math.cos(a2) * hr),
      sx(hy + Math.sin(a2) * hr),
      sw(26),
      255,
      255,
      255,
      1
    );
  }
  drawSegment(buf, size, size, sx(136), sx(274), sx(136), sx(248), sw(26), 255, 255, 255, 1);
  drawSegment(buf, size, size, sx(136), sx(248), sx(170), sx(274), sw(24), 255, 255, 255, 1);

  // Orange bobber / eye at top
  drawCircle(buf, size, size, sx(256), sx(116), sw(24), 249, 115, 22, 1);
  drawCircle(buf, size, size, sx(256), sx(116), sw(9), 11, 25, 44, 1);

  // Orange plus mark (cash ledger)
  drawSegment(buf, size, size, sx(306), sx(178), sx(358), sx(178), sw(18), 249, 115, 22, 1);
  drawSegment(buf, size, size, sx(332), sx(152), sx(332), sx(204), sw(18), 249, 115, 22, 1);

  return encodePNG(size, size, buf);
}

const outDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), renderIcon(192, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), renderIcon(512, false));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), renderIcon(512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), renderIcon(180, false));
console.log('PWA PNG icons generated in /public');
