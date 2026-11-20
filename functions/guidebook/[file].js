// Private guest guidebooks, served from seeyouiniceland.is/guidebook/<token>.pdf.
//
// The guidebooks hold the key-box code and directions to the cabin, so they are for booked
// guests only: the link goes out in the pre-arrival email and is listed nowhere else. This
// repository is public, so neither the PDF nor the token lives here. Both come from the Pages
// secret GUIDEBOOKS, a JSON object mapping each token to the Google Drive file id of its PDF:
//
//   {"<random token>": "<drive file id>"}
//
// The PDF itself stays in Google Drive (shared "anyone with the link"), so replacing the file
// there — Manage versions, keeping the same id — updates the guidebook without a deploy.
// Any other path falls through to the site's 404 page, so a wrong token looks like any
// missing page and does not confirm that guidebooks exist.

// Edge copies are kept this long, so a new version uploaded to Drive shows within the hour.
const EDGE_TTL = 3600;

function guidebooks(env) {
  try {
    return JSON.parse(env.GUIDEBOOKS || '{}');
  } catch {
    return {};
  }
}

export async function onRequest(context) {
  const { request, params, env } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();

  const token = String(params.file || '').replace(/\.pdf$/, '');
  const books = guidebooks(env);
  const driveId = Object.hasOwn(books, token) ? books[token] : null;
  if (!driveId) return context.next();

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + `/guidebook/${token}.pdf`);
  let pdf = await cache.match(cacheKey);

  if (!pdf) {
    const drive = await fetch(
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`
    ).catch(() => null);
    // Drive answers a file it will not hand out (unshared, deleted) with an HTML page, not an
    // error status, so check what came back rather than trusting the 200. A real download
    // arrives as application/pdf or application/octet-stream.
    const type = drive?.headers.get('Content-Type') || '';
    if (!drive?.ok || type.includes('text/html')) {
      return new Response('The guidebook is temporarily unavailable. Please contact your host.', {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    pdf = new Response(drive.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="Guest-Guidebook.pdf"',
        'Cache-Control': `public, max-age=${EDGE_TTL}`,
      },
    });
    context.waitUntil(cache.put(cacheKey, pdf.clone()));
  }

  const headers = new Headers(pdf.headers);
  // Never indexed, never cached by a shared proxy, and the link is not passed on as a referrer
  // when a guest clicks out of the PDF.
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(request.method === 'HEAD' ? null : pdf.body, { status: 200, headers });
}
