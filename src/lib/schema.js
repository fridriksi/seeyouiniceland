// schema.org objects for the pages that have something factual to declare.
//
// Everything here is built from data the site already holds — no invented ratings, no review
// counts, no prices we cannot source. Structured data that overstates is worse than none:
// it is the one part of a page a search engine treats as a claim about the world.

export const SITE = 'https://www.seeyouiniceland.is';
const abs = (path) => (String(path).startsWith('http') ? path : `${SITE}${path}`);

const stripHtml = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&(?:#39|apos);/g, "'")
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const clip = (text, max = 300) => {
  const t = stripHtml(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = cut.lastIndexOf('. ');
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…';
};

export const organization = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'See you in Iceland',
  url: SITE,
  logo: abs('/logo-full.png'),
  email: 'info@seeyouiniceland.is',
  areaServed: { '@type': 'Place', name: 'South Iceland' },
});

export const website = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  url: SITE,
  name: 'See you in Iceland',
  publisher: { '@id': `${SITE}/#organization` },
  inLanguage: 'en-GB',
});

/** trail: [{ name, path }] — the page itself last, with its own path. */
export const breadcrumb = (trail) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    item: abs(item.path),
  })),
});

export const cabinSchema = (cabin) => {
  const place = cabin.place || {};
  const images = [cabin.cover, ...(cabin.gallery || [])]
    .filter(Boolean)
    .map((g) => abs(typeof g === 'string' ? g : g.src))
    .slice(0, 6);

  const amenities = cabin.amenities || [];
  const says = (re) => amenities.some((a) => re.test(a));

  // LodgingBusiness, not VacationRental. VacationRental is a subtype, so Google validated the
  // same node against both specs: it passed as a local business and failed as a vacation
  // rental. That spec belongs to Google's Vacation Rentals partner programme and demands
  // identifier, checkinTime, checkoutTime, coordinates and a data feed — none of which Hostly
  // gives us, and inventing check-in times to silence the error would be a lie in the one
  // block a search engine reads as fact.
  const node = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    '@id': `${SITE}/cabins/${cabin.slug}#lodging`,
    name: cabin.name,
    url: `${SITE}/cabins/${cabin.slug}`,
    description: clip(cabin.intro),
    image: images,
    // Only stated when the amenity list actually says so. An amenity list that is silent about
    // pets is not the same as one that forbids them, and "petsAllowed: false" would be us
    // making that claim on the owner's behalf.
    petsAllowed: says(/pets allowed/i) ? true : undefined,
    smokingAllowed: says(/no smoking/i) ? false : undefined,
    // Hostly does not report a currency with its nightly rates, so no price is declared here.
    // A number without the right currency would be a false claim, and this is the one block a
    // search engine reads as fact.
    numberOfRooms: Number(String(cabin.bedroomsLabel || '').match(/^(\d+)/)?.[1]) || undefined,
    occupancy: cabin.maxGuests
      ? { '@type': 'QuantitativeValue', maxValue: cabin.maxGuests, unitText: 'guests' }
      : undefined,
    amenityFeature: (cabin.amenities || []).map((a) => ({
      '@type': 'LocationFeatureSpecification',
      name: a,
      value: true,
    })),
    containedInPlace: { '@id': `${SITE}/#organization` },
  };

  if (place.locality) {
    node.address = {
      '@type': 'PostalAddress',
      addressLocality: place.locality,
      addressRegion: place.region,
      addressCountry: place.country || 'IS',
    };
  }
  if (place.latitude && place.longitude) {
    node.geo = { '@type': 'GeoCoordinates', latitude: place.latitude, longitude: place.longitude };
  }
  if (cabin.size) node.floorSize = { '@type': 'QuantitativeValue', name: cabin.size };

  // JSON.stringify drops undefined, so optional fields simply vanish rather than appearing null.
  return node;
};

/** The tours page: one ItemList so the whole catalogue is legible as a set. */
export const tourListSchema = (tours) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Tours in South Iceland',
  numberOfItems: tours.length,
  itemListElement: tours.map((t, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'TouristTrip',
      name: t.title,
      description: clip(t.info?.description || t.blurb, 300),
      image: t.image ? [t.image] : undefined,
      provider: t.info?.vendor ? { '@type': 'Organization', name: t.info.vendor } : undefined,
      // Unlike the cabins, TourDesk states the currency, so the price can be declared.
      offers:
        t.price && t.currency
          ? {
              '@type': 'Offer',
              price: t.price,
              priceCurrency: t.currency,
              availability: 'https://schema.org/InStock',
              url: `${SITE}/tours`,
            }
          : undefined,
    },
  })),
});
