// Shared TourDesk client for the build-time scripts.
//
// The key is read from .env (gitignored) or the TOURDESK_API_KEY environment variable. It is
// never written into anything the build emits: the browser reaches TourDesk only through
// functions/api/tourdesk, which holds the key as a Cloudflare Pages secret.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.tourdesk.io/api/v1.0';

export function apiKey() {
  if (process.env.TOURDESK_API_KEY) return process.env.TOURDESK_API_KEY.trim();
  const envFile = join(root, '.env');
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').replace(/^﻿/, '').match(/^TOURDESK_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('No TourDesk key. Put TOURDESK_API_KEY=... in seeyouiniceland-site/.env');
}

export async function td(method, path, body) {
  const res = await fetch(`${BASE}/${path}`, {
    method,
    headers: {
      ApiKey: apiKey(),
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
