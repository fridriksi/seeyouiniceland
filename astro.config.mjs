import { defineConfig } from 'astro/config';

// Static output: every page is prerendered at build time and served from Cloudflare Pages.
// Nothing here talks to Framer — cabin facts come from Hostly during the build (see
// scripts/sync-cabins.mjs), and images are served from this project.
export default defineConfig({
  site: 'https://www.seeyouiniceland.is',
  output: 'static',
  // The published Framer site answers /tours and /cabins/secluded-cabin directly with 200 —
  // no trailing slash — and those are the URLs Google has indexed. 'file' emits tours.html
  // so Cloudflare Pages serves them at the same paths instead of 308-ing to /tours/.
  trailingSlash: 'never',
  build: { format: 'file' },
  devToolbar: { enabled: false },
});
