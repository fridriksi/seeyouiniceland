// Server-side proxy to the TourDesk affiliate API.
//
// TourDesk authenticates with an ApiKey header. The site is static, so anything the browser
// can read is public — the key lives only here, as the Cloudflare Pages secret
// TOURDESK_API_KEY, and never reaches the page.
//
// This is deliberately NOT a general proxy. Only the calls the site actually makes are
// allowed through; anything else is refused, so a leaked endpoint cannot be used to drive
// the whole affiliate account.

const TOURDESK = 'https://api.tourdesk.io/api/v1.0';

// Each entry: the method, a pattern for the path after /api/tourdesk/, and whether a body
// is forwarded. Patterns use :seg for one path segment.
// Searching the catalogue and reading tour descriptions happens at build time in
// scripts/sync-tours.mjs, so those endpoints are deliberately absent here.
const ALLOWED = [
  { method: 'GET', pattern: 'TourAvailability/GetDateRange/:key/:start/:end' },
  { method: 'GET', pattern: 'TourAvailability/:key/:date/:culture' },
  { method: 'POST', pattern: 'TourBooking/:id', body: true },
];

function matches(pattern, segments) {
  const parts = pattern.split('/');
  if (parts.length !== segments.length) return false;
  return parts.every((p, i) => (p.startsWith(':') ? segments[i].length > 0 : p === segments[i]));
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequest(context) {
  const { request, params, env } = context;

  const key = env.TOURDESK_API_KEY;
  if (!key) {
    // Fail loudly rather than silently returning empty results — an unset secret after a
    // deploy is otherwise very hard to tell apart from "this tour has no availability".
    return json({ error: 'TourDesk is not configured on this deployment.' }, 503);
  }

  const segments = Array.isArray(params.route) ? params.route : [params.route].filter(Boolean);
  if (segments.length === 0) return json({ error: 'No endpoint given.' }, 400);

  const rule = ALLOWED.find((r) => r.method === request.method && matches(r.pattern, segments));
  if (!rule) return json({ error: 'That endpoint is not available.' }, 404);

  const url = new URL(request.url);
  const target = `${TOURDESK}/${segments.map(encodeURIComponent).join('/')}${url.search}`;

  const init = {
    method: request.method,
    headers: { ApiKey: key, Accept: 'application/json' },
  };
  if (rule.body) {
    init.headers['Content-Type'] = 'application/json';
    init.body = await request.text();
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return json({ error: 'Could not reach TourDesk.' }, 502);
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    // Pass the status through but not the upstream body: it can echo request details, and
    // there is no reason for our key's error messages to surface in a visitor's browser.
    return json({ error: `TourDesk returned ${upstream.status}.` }, upstream.status === 401 ? 500 : 502);
  }

  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Tour and search data changes rarely; availability must never be cached.
      'Cache-Control': segments[0] === 'TourAvailability' || segments[0] === 'TourBooking'
        ? 'no-store'
        : 'public, max-age=300',
    },
  });
}
