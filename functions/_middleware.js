// Sends the bare apex to www, so every page exists at exactly one address.
//
// This is not in a _redirects file: Cloudflare Pages only matches paths there, not hostnames,
// so `https://seeyouiniceland.is/*` silently never fired. Middleware sees the whole URL.
//
// Everything else falls straight through to the static asset or the API function, so this
// costs nothing but a hostname comparison.

const CANONICAL_HOST = 'www.seeyouiniceland.is';
const REDIRECT_FROM = 'seeyouiniceland.is';

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname === REDIRECT_FROM) {
    url.hostname = CANONICAL_HOST;
    // 301: this is a permanent choice of address, and search engines should move their index.
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
