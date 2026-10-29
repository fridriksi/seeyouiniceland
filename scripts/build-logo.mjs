// Turns the supplied logo PNG into the assets the site needs.
//
//   node scripts/build-logo.mjs <source.png>
//
// The artwork arrives as dark navy on a near-white ground. Transparency is cut by distance
// from that ground rather than by luminance — a luminance mask would make the blue peak
// half-transparent, since mid blue is nowhere near black.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-logo.mjs <source.png>'); process.exit(1); }

const img = sharp(readFileSync(src));
const meta = await img.metadata();
const { data, info } = await img.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

// Sample the corners to learn the real background colour — it is not pure white.
const corner = (x, y) => {
  const i = (y * width + x) * channels;
  return [data[i], data[i + 1], data[i + 2]];
};
const samples = [corner(2, 2), corner(width - 3, 2), corner(2, height - 3), corner(width - 3, height - 3)];
const bg = [0, 1, 2].map((c) => Math.round(samples.reduce((s, p) => s + p[c], 0) / samples.length));
console.log(`source ${width}x${height}, background rgb(${bg.join(', ')})`);

// alpha from distance to the background, with a small dead zone so paper texture stays out
const DEAD = 26;   // ignore anything this close to the ground
const GAIN = 3.4;  // reach full opacity quickly so the artwork stays solid
const out = Buffer.alloc(width * height * 4);
let minX = width, minY = height, maxX = 0, maxY = 0, kept = 0;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    const a = Math.max(0, Math.min(255, Math.round((dist - DEAD) * GAIN)));
    const o = (y * width + x) * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    if (a > 24) {
      kept++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
console.log(`opaque pixels: ${kept}  bounding box: ${minX},${minY} -> ${maxX},${maxY}`);

const pad = 4;
const box = {
  left: Math.max(0, minX - pad),
  top: Math.max(0, minY - pad),
  width: Math.min(width, maxX + pad) - Math.max(0, minX - pad),
  height: Math.min(height, maxY + pad) - Math.max(0, minY - pad),
};

const trimmed = sharp(out, { raw: { width, height, channels: 4 } }).extract(box);
await trimmed.clone().png().toFile(join(root, 'public', 'logo-full.png'));
const t = await sharp(join(root, 'public', 'logo-full.png')).metadata();
console.log(`wrote public/logo-full.png  ${t.width}x${t.height}`);

// A compact wordmark for the header: the same lockup, just smaller on the long edge.
await sharp(join(root, 'public', 'logo-full.png'))
  .resize({ width: 640, withoutEnlargement: true })
  .png({ quality: 92 })
  .toFile(join(root, 'public', 'logo-wordmark.png'));
console.log('wrote public/logo-wordmark.png');

// Light version for the footer, whose ground is the site's slate — the navy artwork would be
// almost invisible on it. Alpha is kept; every visible pixel is repainted in the page colour.
{
  const lock = await sharp(join(root, 'public', 'logo-full.png'))
    .resize({ width: 640, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = lock.info;
  const px = lock.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    px[i] = 0xe7; px[i + 1] = 0xe7; px[i + 2] = 0xe7;
  }
  await sharp(px, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(join(root, 'public', 'logo-wordmark-light.png'));
  console.log(`wrote public/logo-wordmark-light.png  ${w}x${h}`);
}
