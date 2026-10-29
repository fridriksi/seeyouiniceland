// Responsive variants for the images under public/img.
//
// Every photo is stored once at up to 2000px wide. Without a srcset a phone downloads that
// full file — 300–575 KB each, 3 MB+ for a cabin gallery — which drags down the mobile Core
// Web Vitals Google ranks on. scripts/build-responsive-images.mjs runs before every build
// and writes narrower copies next to each original (cover.webp -> cover.w960.webp); this
// file turns those into srcset/sizes attributes.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const WIDTHS = [480, 960, 1440];

export const variantPath = (src, width) => src.replace(/\.webp$/, `.w${width}.webp`);

/**
 * srcset/sizes attributes for an image, to spread onto an <img>.
 * Lists only variants that exist on disk, so an image the generator skipped (or one hosted
 * elsewhere) just falls back to its plain src instead of pointing at a missing file.
 */
export function responsive(image, sizes) {
  if (!image?.src?.startsWith('/img/') || !image.src.endsWith('.webp') || !image.width) return {};
  const candidates = WIDTHS.filter(
    (w) => w < image.width && existsSync(join(process.cwd(), 'public', variantPath(image.src, w))),
  ).map((w) => `${variantPath(image.src, w)} ${w}w`);
  if (candidates.length === 0) return {};
  return { srcset: [...candidates, `${image.src} ${image.width}w`].join(', '), sizes };
}
