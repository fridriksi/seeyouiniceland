// One-off import: takes the CMS export pulled out of Framer, downloads every cabin image off
// framerusercontent.com, re-encodes it as WebP into public/img/cabins/<slug>/, and writes
// src/content/cabins.meta.json pointing at the local copies.
//
//   node scripts/import-cabin-media.mjs <path-to-cms-export.json>
//
// After this runs, nothing about the cabins depends on Framer's CDN.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exportPath = process.argv[2];
if (!exportPath) {
  console.error('usage: node scripts/import-cabin-media.mjs <cms-export.json>');
  process.exit(1);
}

// Strip a UTF-8 BOM: this file usually arrives via a shell redirect, and PowerShell writes one.
const cms = JSON.parse(readFileSync(exportPath, 'utf8').replace(/^﻿/, ''));

async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Framer's "Intro Text" and "Location text" are already HTML fragments; keep them as-is.
const meta = {};
let downloaded = 0;
let failed = 0;

for (const [slug, item] of Object.entries(cms)) {
  const dir = join(root, 'public', 'img', 'cabins', slug);
  mkdirSync(dir, { recursive: true });

  async function importOne(image, name) {
    if (!image || !image.url) return null;
    try {
      const buf = await fetchImage(image.url);
      const out = `${name}.webp`;
      const info = await sharp(buf)
        .resize({ width: 1800, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(join(dir, out));
      downloaded++;
      return { src: `/img/cabins/${slug}/${out}`, alt: image.alt || '', width: info.width, height: info.height };
    } catch (err) {
      failed++;
      console.error(`  failed ${slug}/${name}: ${err.message}`);
      return null;
    }
  }

  const cover = await importOne(item.cover, 'cover');
  const gallery = [];
  for (let i = 0; i < (item.gallery || []).length; i++) {
    const g = await importOne(item.gallery[i], `gallery-${String(i + 1).padStart(2, '0')}`);
    if (g) gallery.push(g);
  }

  meta[slug] = {
    order: item.order,
    headline: item.headline || '',
    intro: item.intro || '',
    locationText: item.locationText || '',
    size: item.size || null,
    guestsLabel: item.guestsLabel || '',
    bedroomsLabel: item.bedroomsLabel || '',
    // The CMS stores these as one newline-separated string.
    amenities: String(item.amenitiesRaw || '').split('\n').map((s) => s.trim()).filter(Boolean),
    mapsLink: item.mapsLink || null,
    cover,
    gallery,
  };
  console.log(`${slug}: cover ${cover ? 'ok' : 'MISSING'}, ${gallery.length} gallery images`);
}

writeFileSync(join(root, 'src', 'content', 'cabins.meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`\ndownloaded ${downloaded} images, ${failed} failed`);
console.log('wrote src/content/cabins.meta.json');
