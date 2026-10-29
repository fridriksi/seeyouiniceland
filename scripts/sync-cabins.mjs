// Pulls the factual side of each cabin from Hostly and writes it to src/content/cabins.json.
//
// Run it when you change a property in Hostly; the committed JSON is what the build reads, so
// a Hostly outage can never break a deploy. That split is deliberate: the network call happens
// when a person asks for it, not on Cloudflare's build machine.
//
//   npm run sync-cabins
//
// Photos and marketing headlines are NOT synced — they live in src/content/cabins.meta.json
// because Hostly does not hold them.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TENANT = 't_mqa67f3xykkee';
const HOST = 'https://app.hostly.is';

// Amenity codes come back as slugs; these labels match what the Hostly admin shows.
const AMENITY_LABELS = {
  wifi: 'Wi-Fi', parking: 'Free parking', hottub: 'Hot tub', sauna: 'Sauna',
  deck: 'Deck / patio', bbq: 'BBQ / grill', ac: 'Air conditioning', heating: 'Central heating',
  radiators: 'Radiators', electricheat: 'Electric heaters', fireplace: 'Fireplace',
  coffee: 'Coffee machine', dishwasher: 'Dishwasher', washer: 'Washing machine', dryer: 'Dryer',
  tv: 'TV', kitchen: 'Kitchen', oven: 'Oven', microwave: 'Microwave', fridge: 'Fridge',
  crib: 'Crib', pets: 'Pets allowed', accessible: 'Accessible', evcharger: 'EV charger',
  garden: 'Garden', seaview: 'Sea view', mountainview: 'Mountain view', workspace: 'Workspace',
  linens: 'Linens & towels', nosmoking: 'No smoking', firstaid: 'First aid kit',
  smokealarm: 'Smoke alarm',
};

async function getJson(path) {
  const res = await fetch(HOST + path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const metaPath = join(root, 'src', 'content', 'cabins.meta.json');
const outPath = join(root, 'src', 'content', 'cabins.json');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

// Only properties the widget offers publicly — this is the same `listed` flag the booking
// widget honours, so an unlisted test property never leaks onto the marketing site.
const properties = await getJson(`/widget/${TENANT}/properties`);

// Joined on Hostly's property id, not the slug: Hostly slugs the Hveragerdi house
// "luxuryhomeinhveragerdi" while the site's URL is "luxury-home-hveragerdi", and the site's
// URL is the one that is already indexed. The id is the only stable key across the two.
const bySite = new Map(Object.entries(meta).map(([slug, m]) => [m.propertyId, { slug, ...m }]));

const cabins = [];
for (const p of properties) {
  const m = bySite.get(p.id);
  if (!m) {
    console.warn(`skipping ${p.name} (${p.id}) — no entry in cabins.meta.json`);
    continue;
  }
  const avail = await getJson(`/widget/${TENANT}/${p.id}/availability`);
  const pricing = avail.pricing || {};

  cabins.push({
    ...m,
    propertyId: p.id,
    // Hostly is the source of truth for the facts; the site keeps its own slug and copy.
    name: p.name,
    maxGuests: p.maxGuests,
    minStay: (pricing.minStayRules || {}).default || 1,
    priceFrom: Math.min(Number(pricing.priceLow) || 0, Number(pricing.priceHigh) || 0) || null,
    cleaningFee: Number(pricing.cleaningFee) || 0,
  });
}

cabins.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
writeFileSync(outPath, JSON.stringify({ syncedAt: new Date().toISOString(), cabins }, null, 2) + '\n');
console.log(`wrote ${cabins.length} cabins to src/content/cabins.json`);
for (const c of cabins) console.log(`  ${c.slug}  ${c.maxGuests} guests  min ${c.minStay} nights`);
