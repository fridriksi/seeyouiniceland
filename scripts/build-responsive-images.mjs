// Writes narrower copies of every photo under public/img for srcset (see src/lib/img.js).
//
//   node scripts/build-responsive-images.mjs
//
// Runs automatically before `npm run build` and `npm run dev`. The copies are gitignored and
// regenerated on each Cloudflare build; locally a copy newer than its original is kept.

import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { WIDTHS, variantPath } from '../src/lib/img.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imgDir = join(root, 'public', 'img');
const isVariant = (name) => /\.w\d+\.webp$/.test(name);

function* originals(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* originals(path);
    else if (entry.name.endsWith('.webp') && !isVariant(entry.name)) yield path;
  }
}

const isFresh = (out, src) => {
  try {
    return statSync(out).mtimeMs >= statSync(src).mtimeMs;
  } catch {
    return false;
  }
};

let written = 0;
let kept = 0;

for (const src of originals(imgDir)) {
  const { width } = await sharp(src).metadata();
  for (const w of WIDTHS.filter((w) => w < width)) {
    const out = variantPath(src, w);
    if (isFresh(out, src)) {
      kept++;
      continue;
    }
    await sharp(src).resize({ width: w }).webp({ quality: 78 }).toFile(out);
    written++;
  }
}

console.log(`responsive images: ${written} written, ${kept} up to date`);
