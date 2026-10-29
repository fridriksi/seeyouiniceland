// Searches TourDesk so you can find the id of a tour to add to src/content/tours.json.
//
//   npm run find-tours -- "reykjadalur"
//
// Copy the id from the first column into the curated list, then run npm run sync-tours.

import { td } from './tourdesk.mjs';

const term = process.argv.slice(2).join(' ').trim();
if (!term) {
  console.error('usage: npm run find-tours -- "search words"');
  process.exit(1);
}

const res = await td('POST', 'TourSearch', { searchParameter: term, pageSize: 25 });
const hits = res.activities ?? [];
console.log(`${hits.length} shown of ${res.totalCount} matches for "${term}"\n`);
for (const t of hits) {
  console.log(`  ${t.uniqueKey.padEnd(10)} ${String(t.formattedPrice ?? '').padEnd(12)} ${String(t.durationFormatted ?? '').padEnd(20)} ${t.title}`);
}
