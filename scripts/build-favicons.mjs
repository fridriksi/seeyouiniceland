// Renders the favicon set from public/logo.svg.
//
//   node scripts/build-favicons.mjs
//
// Google will only use a favicon whose source is square and a multiple of 48px — 48, 96, 144.
// The site shipped 16x16 and 32x32, which qualify for neither, so Google kept serving the icon
// it had cached from the old Framer site instead. It also probes /favicon.ico directly, and
// that path was answering with the 404 page.

import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'public', 'logo.svg');

// density high enough that the vector is rasterised cleanly rather than upscaled.
const render = (size) =>
  sharp(src, { density: 600 }).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer();

// An ICO is a small header plus one directory entry per image; PNG payloads are allowed and
// are what every current browser and Googlebot read.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const sizes = [48, 96, 144, 192, 512];
for (const size of sizes) {
  writeFileSync(join(root, 'public', `favicon-${size}.png`), await render(size));
  console.log(`  favicon-${size}.png`);
}

const ico = buildIco(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await render(size) }))));
writeFileSync(join(root, 'public', 'favicon.ico'), ico);
console.log(`  favicon.ico (16/32/48, ${Math.round(ico.length / 1024)}kB)`);

writeFileSync(join(root, 'public', 'apple-touch-icon.png'), await render(180));
console.log('  apple-touch-icon.png (180)');
