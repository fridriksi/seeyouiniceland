// Pulls the tours for /tours from TourDesk and writes them to src/content/tours.generated.json.
//
//   npm run sync-tours
//
// The list comes from the TourDesk **tour template** the API key is attached to — currently
// "South Iceland tours". TourSearch with no filters returns exactly that template's tours, so
// the template is the editing surface: add or remove a tour in TourDesk, run this, deploy.
// src/content/tours.json only carries ordering tweaks.
//
// Same split as sync-cabins: the network call happens when a person asks for it, and the
// committed JSON is what the build reads, so a TourDesk outage cannot break a deploy. Live
// availability and the booking call go through functions/api/tourdesk at request time, because
// a free seat cannot be baked in.

import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { td, root } from './tourdesk.mjs';

const settings = JSON.parse(readFileSync(join(root, 'src', 'content', 'tours.json'), 'utf8'));
const featured = settings.featured ?? [];
const exclude = new Set(settings.exclude ?? []);

const iso = (d) => d.toISOString().slice(0, 10);
const plusDays = (d, n) => new Date(d.getTime() + n * 86400000);

// TourDesk descriptions are HTML with inline styles. The cards want a plain sentence or two.
const plain = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:#39|apos);/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

// TourDesk's rich-text fields are HTML written by each operator: inline font sizes and
// colours, headings at arbitrary levels, and links back to their own booking pages. Keep the
// structure that carries meaning — paragraphs, lists, emphasis — and drop everything else.
// Links go too: a link to the operator's own site would walk the booking straight out of ours.
const ALLOWED_TAGS = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'br']);
const TAG_ALIASES = { b: 'strong', i: 'em', h1: 'strong', h2: 'strong', h3: 'strong', h4: 'strong', h5: 'strong', h6: 'strong', u: 'em', div: 'p' };

const sanitize = (html) => {
  let out = String(html || '').replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_, raw) => {
    const tag = raw.toLowerCase();
    const mapped = TAG_ALIASES[tag] || tag;
    if (!ALLOWED_TAGS.has(mapped)) return ' ';
    const closing = /^<\//.test(_);
    if (mapped === 'br') return '<br>';
    return closing ? `</${mapped}>` : `<${mapped}>`;
  });
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/(\s*<br>\s*){3,}/g, '<br><br>')
    .replace(/<p>\s*(<br>)*\s*<\/p>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+</g, '<')
    .replace(/>\s+/g, '>')
    .trim();
  // A field that turns out to hold only whitespace should read as absent, not as an empty box.
  return out.replace(/<[^>]*>/g, '').trim() ? out : null;
};

const clip = (text, max) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…';
};

// Read a file's pixel dimensions from its header alone — a range request, not a download.
// 64KB, not 2KB: a JPEG's SOF marker sits after whatever EXIF and colour profile came before
// it, and at 2KB this silently returned null for photos that were perfectly good, so "pick the
// largest" quietly degraded into "pick the first one I could measure".
async function dimensions(url) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-65535' } });
    const b = Buffer.from(await res.arrayBuffer());
    if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length - 9) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        }
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch {}
  return null;
}

// Cards render around 400px wide, so aim for roughly 2x that for retina. Below CARD_MIN_WIDTH
// a photo is visibly soft; far above CARD_TARGET_WIDTH it is just wasted bandwidth.
const CARD_MIN_WIDTH = 1000;
const CARD_TARGET_WIDTH = 1400;

// Providers use two different vocabularies for image sizes. Most give named ones
// ("Large", "GalleryMainSlider"); some give literal dimensions ("1600x900", "800x0", where a
// zero means "scale to fit"). Reading the name is free, so only named sizes cost a request.
async function widthsFor(img) {
  const versions = img.versions ?? [];

  const explicit = versions
    .map((v) => ({ url: v.url, w: Number((/^(\d+)x\d+$/.exec(v.size) || [])[1]) || 0 }))
    .filter((x) => x.w > 0);
  if (explicit.length) return explicit;

  const out = [];
  for (const size of ['Large', 'GalleryMainSlider', 'Thumbnail']) {
    const v = versions.find((x) => x.size === size);
    if (!v) continue;
    const d = await dimensions(v.url);
    if (d) out.push({ url: v.url, w: d.w });
  }
  return out;
}

// A card image has no business being megabytes. Width alone is a bad guide: the LAVA Centre's
// 1490px PNG weighs 3.9MB where a 1350px JPEG next to it is 200KB.
const MAX_CARD_BYTES = 700 * 1024;

async function byteSize(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return Number(res.headers.get('content-length')) || 0;
  } catch {
    return 0;
  }
}

// Take whichever usable width sits closest to the target — in either direction. Preferring
// the smallest one *above* the target instead made the Hot Springs Pass card load a 4000px
// original when a 1200px copy was sitting right beside it. Then, only if that pick turns out
// to be huge, trade a little sharpness for the smallest file that is still big enough.
async function bestOf(candidates) {
  const usable = candidates.filter((c) => c.w >= CARD_MIN_WIDTH);
  if (!usable.length) return candidates.sort((a, b) => b.w - a.w)[0] ?? null;

  const byCloseness = [...usable].sort(
    (a, b) => Math.abs(a.w - CARD_TARGET_WIDTH) - Math.abs(b.w - CARD_TARGET_WIDTH)
  );
  const first = byCloseness[0];
  if (usable.length === 1 || (await byteSize(first.url)) <= MAX_CARD_BYTES) return first;

  let lightest = first;
  let lightestBytes = Infinity;
  for (const c of byCloseness) {
    const bytes = await byteSize(c.url);
    if (bytes && bytes < lightestBytes) { lightest = c; lightestBytes = bytes; }
    if (lightestBytes <= MAX_CARD_BYTES) break;
  }
  return lightest;
}

// Operators put their best shot first, so keep image[0] when it is big enough. It often is
// not: the buggy tour's first photo is 642x360 while others in the same gallery are 1543x900.
// Resolution is a decent proxy for the hero shot — operators upload that at full size and pad
// the rest with snapshots.
async function pickCardImage(images) {
  const gallery = images ?? [];
  if (!gallery.length) return null;

  const firstBest = await bestOf(await widthsFor(gallery[0]));
  if (firstBest && firstBest.w >= CARD_MIN_WIDTH && (await byteSize(firstBest.url)) <= MAX_CARD_BYTES) {
    return firstBest.url;
  }

  // The operator's lead photo is either too small or too heavy — some galleries hold a single
  // 4MB PNG at every size they offer. Walk the rest looking for one that is both.
  let widest = firstBest;
  const affordable = [];
  for (const img of gallery.slice(1)) {
    const candidate = await bestOf(await widthsFor(img));
    if (!candidate) continue;
    if (!widest || candidate.w > widest.w) widest = candidate;
    if (candidate.w >= CARD_MIN_WIDTH && (await byteSize(candidate.url)) <= MAX_CARD_BYTES) {
      affordable.push(candidate);
      // Good enough: sharp, light, and still near the front of the operator's own ordering.
      break;
    }
  }
  return (affordable[0] ?? widest)?.url ?? null;
}

// The smallest party a tour will actually take. Tour.minimumPassengers is not it: the
// Reykjadalur hike reports 1 there while every departure demands 4. The departures are the
// truth, so read one — otherwise a card advertising "from 19.990" opens a dialog at 79.960
// and looks like a bait and switch.
async function minPartyFor(id) {
  const range = await td('GET', `TourAvailability/GetDateRange/${id}/${iso(new Date())}/${iso(plusDays(new Date(), 180))}`);
  for (const day of (Array.isArray(range) ? range : []).slice(0, 5)) {
    const slots = await td('GET', `TourAvailability/${id}/${String(day).slice(0, 10)}/en`);
    const slot = (Array.isArray(slots) ? slots : []).find((s) => s.bookable && !s.soldOut && !s.unavailable);
    if (!slot) continue;
    const variant = (slot.variants || [])[0];
    const cats = variant?.pricePerCategories || [];
    const def = cats.find((c) => c.isDefault) || cats[0];
    return Math.max(
      Number(slot.minParticipants) || 1,
      Number(variant?.minPerBooking) || 1,
      Number(def?.initCount) || 1
    );
  }
  return 1;
}

// Read the whole template, following pages if it ever outgrows one.
async function fetchTemplate() {
  const all = [];
  let page = 0;
  let total = null;
  do {
    const res = await td('POST', 'TourSearch', { page, pageSize: 100 });
    const batch = res?.activities ?? [];
    if (total === null) total = Number(res?.totalCount ?? batch.length);
    if (!batch.length) break;
    all.push(...batch);
    page += 1;
  } while (all.length < total && page < 20);
  return { listed: all, total };
}

const { listed, total } = await fetchTemplate();

if (!listed.length) {
  console.error('TourDesk returned no tours at all — nothing written.');
  console.error('Check that the API key is still attached to a tour template.');
  process.exit(1);
}
if (listed.length < total) {
  console.error(`Only ${listed.length} of ${total} tours came back — nothing written. Try again.`);
  process.exit(1);
}

const wanted = listed.filter((a) => !exclude.has(a.uniqueKey));

const tours = [];
const failed = [];

for (const listing of wanted) {
  const id = listing.uniqueKey;
  try {
    const detail = await td('GET', `Tour/${id}/en`);
    if (!detail || !detail.title) throw new Error('no detail returned');
    const minParty = await minPartyFor(id);

    tours.push({
      id,
      title: detail.title.trim(),
      subtitle: (detail.subTitle || '').trim() || null,
      blurb: clip(plain(detail.summary || detail.description || listing.description), 190),
      image: (await pickCardImage(detail.images)) || listing.photoUrl,
      price: detail.price ?? listing.price ?? null,
      priceFormatted: detail.priceFormatted || listing.formattedPrice || null,
      currency: detail.currencyCode || listing.currency || 'ISK',
      duration: detail.durationFormatted || listing.durationFormatted || null,
      minimumAge: detail.minimumAge || 0,
      minParty,
      pickupService: !!detail.pickupService,
      mandatoryPickup: !!detail.mandatoryPickup,

      // Everything the "More info" panel shows. Baked in rather than fetched on click: it is
      // about 60KB of text across the whole catalogue, and this way the panel opens instantly
      // and still works when TourDesk does not.
      info: {
        description: sanitize(detail.description),
        included: sanitize(detail.included),
        requirements: sanitize(detail.requirements),
        attention: sanitize(detail.attention),
        cancellation: sanitize(detail.activityCancellationPolicyText),
        vendor: detail.vendor?.vendorName?.trim() || null,
        meetingPoint: (detail.meetingPoints || [])
          .map((m) => (m.name || m.title || m.address || '').trim())
          .filter(Boolean)[0] || null,
        // "Self-Drive" tells a visitor something real; "Other / Non-Travel" is TourDesk's
        // filler for a venue you simply turn up at, and reads as noise on a card.
        travelMethod:
          detail.travelMethod?.name?.trim().toLowerCase() === 'other / non-travel'
            ? null
            : detail.travelMethod?.name?.trim() || null,
        gallery: (detail.images || [])
          .map((img) => (img.versions ?? []).find((v) => v.size === 'Large' || /^\d+x\d+$/.test(v.size))?.url)
          .filter(Boolean)
          .slice(0, 6),
      },
    });
  } catch (err) {
    failed.push(`${id} (${listing.title?.slice(0, 40)}): ${err.message}`);
  }
}

// Refuse to write a short list. Overwriting the page with half the tours because the API had
// a bad minute would quietly strip it at the next deploy.
if (failed.length) {
  console.error(`\n${failed.length} of ${wanted.length} tours failed — nothing written:`);
  for (const f of failed) console.error(`  ${f}`);
  console.error('\nRun it again; if one keeps failing, add its id to "exclude" in src/content/tours.json.');
  process.exit(1);
}

// Featured ids float to the top in the order given; everything else keeps the template's order.
const rank = (t) => {
  const i = featured.indexOf(t.id);
  return i === -1 ? featured.length : i;
};
tours.sort((a, b) => rank(a) - rank(b));

const out = { syncedAt: new Date().toISOString(), source: 'TourDesk tour template', tours };
writeFileSync(join(root, 'src', 'content', 'tours.generated.json'), JSON.stringify(out, null, 2) + '\n');

console.log(`wrote ${tours.length} tours to src/content/tours.generated.json`);
if (exclude.size) console.log(`  (${exclude.size} excluded by src/content/tours.json)`);
for (const t of tours) {
  console.log(
    `  ${t.id.padEnd(10)} ${String(t.priceFormatted).padEnd(12)} ${String(t.duration).padEnd(18)}` +
      ` min${String(t.minParty).padEnd(3)} ${t.image ? 'img' : 'NO IMAGE'}  ${t.title.slice(0, 44)}`
  );
}
