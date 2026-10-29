// The sitemap, written by hand rather than pulled from @astrojs/sitemap.
//
// The plugin derives URLs from the build output, and with build.format 'file' that output is
// tours.html / index.html — the same ".html" paths that broke the canonical tags. Listing the
// clean URLs here keeps the sitemap saying exactly what the canonicals say.

import cabinData from '../content/cabins.json';

const SITE = 'https://www.seeyouiniceland.is';

// changefreq and priority are hints search engines mostly ignore; lastmod is the one that
// earns its place, so only that is emitted.
const PAGES = [
  { path: '/' },
  { path: '/cabins' },
  { path: '/tours' },
  { path: '/book-now' },
];

export async function GET() {
  const cabins = cabinData.cabins.map((c) => ({
    path: `/cabins/${c.slug}`,
    lastmod: cabinData.syncedAt,
  }));

  const urls = [...PAGES, ...cabins]
    .map(({ path, lastmod }) => {
      const loc = `${SITE}${path === '/' ? '/' : path}`;
      const stamp = lastmod ? `\n    <lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : '';
      return `  <url>\n    <loc>${loc}</loc>${stamp}\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
