// Downloads a list of images off framerusercontent.com, re-encodes them as WebP and writes a
// manifest of local paths. Reusable for each page as it gets rebuilt.
//
//   node scripts/import-images.mjs <manifest.json> <out-subdir>
//
// The manifest is [{ url, name, alt? }, ...]; output lands in public/img/<out-subdir>/ and a
// name->path map is written to src/content/img.<out-subdir>.json.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [manifestPath, subdir] = process.argv.slice(2);
if (!manifestPath || !subdir) {
  console.error('usage: node scripts/import-images.mjs <manifest.json> <out-subdir>');
  process.exit(1);
}

const list = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));
const outDir = join(root, 'public', 'img', subdir);
mkdirSync(outDir, { recursive: true });

const map = {};
let ok = 0;
let failed = 0;

for (const item of list) {
  try {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const file = `${item.name}.webp`;
    const info = await sharp(buf)
      .resize({ width: 2000, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(join(outDir, file));
    map[item.name] = {
      src: `/img/${subdir}/${file}`,
      alt: item.alt || '',
      width: info.width,
      height: info.height,
    };
    ok++;
    console.log(`  ${item.name}  ${info.width}x${info.height}`);
  } catch (err) {
    failed++;
    console.error(`  FAILED ${item.name}: ${err.message}`);
  }
}

writeFileSync(join(root, 'src', 'content', `img.${subdir}.json`), JSON.stringify(map, null, 2) + '\n');
console.log(`\n${ok} imported, ${failed} failed -> src/content/img.${subdir}.json`);
