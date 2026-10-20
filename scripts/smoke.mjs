// Intima production smoke checks.
// Usage: node scripts/smoke.mjs
// Optional env:
//   SMOKE_BASE_URL           Base URL to probe (default: production).
//   SMOKE_SUPABASE_ANON_KEY  Overrides the bundled public anon key.
// Prints one PASS or FAIL line per probe and exits 1 if any probe fails.
// The fallback key below is the public Supabase publishable (anon) key:
// it ships to every browser in NEXT_PUBLIC_SUPABASE_ANON_KEY (see
// .env.local and lib/supabase/client.ts), so it is not a secret. It is
// never printed by this script.

const BASE = (process.env.SMOKE_BASE_URL || 'https://intima-snowy.vercel.app').replace(/\/$/, '');
const SUPABASE_URL = process.env.SMOKE_SUPABASE_URL || 'https://zkvxecqvopalhpgiygbu.supabase.co';
const ANON_KEY = process.env.SMOKE_SUPABASE_ANON_KEY || 'sb_publishable_odmRX1Z0qzhRpS2UZF_2iQ_b7hEzymx';

let failures = 0;

function pass(name) {
  console.log(`PASS ${name}`);
}

function fail(name, detail) {
  failures += 1;
  console.log(`FAIL ${name} ${detail}`);
}

function info(message) {
  console.log(`INFO ${message}`);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

async function probeStatus(name, path, expectStatus = 200) {
  try {
    const res = await fetchWithTimeout(`${BASE}${path}`);
    if (res.status === expectStatus) pass(name);
    else fail(name, `expected ${expectStatus}, got ${res.status}`);
    return res;
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function probeBodyContains(name, path, needle) {
  try {
    const res = await fetchWithTimeout(`${BASE}${path}`);
    if (res.status !== 200) {
      fail(name, `expected 200, got ${res.status}`);
      return;
    }
    const body = await res.text();
    if (body.includes(needle)) pass(name);
    else fail(name, `body did not contain ${JSON.stringify(needle)}`);
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
  }
}

async function probeJson(name, path) {
  try {
    const res = await fetchWithTimeout(`${BASE}${path}`);
    if (res.status !== 200) {
      fail(name, `expected 200, got ${res.status}`);
      return;
    }
    const text = await res.text();
    try {
      JSON.parse(text);
      pass(name);
    } catch {
      fail(name, 'response was not parseable JSON');
    }
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
  }
}

async function probeSupabase() {
  const name = 'supabase-map-providers';
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
  try {
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/map_providers?select=provider_id&limit=1`,
      { headers },
    );
    if (res.status !== 200) {
      fail(name, `expected 200, got ${res.status}`);
      return;
    }
    pass(name);
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
    return;
  }

  // Count variant: exact total from the content-range header, info only.
  try {
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/map_providers?select=provider_id`,
      {
        headers: {
          ...headers,
          Prefer: 'count=exact',
          Range: '0-0',
          'Range-Unit': 'items',
        },
      },
    );
    const range = res.headers.get('content-range') || '';
    const total = range.includes('/') ? range.split('/')[1] : null;
    if (total && total !== '*') info(`map_providers count: ${total}`);
    else info('map_providers count: unavailable');
  } catch {
    info('map_providers count: unavailable');
  }
}

async function main() {
  console.log(`Smoke checks against ${BASE}`);
  await probeStatus('home', '/');
  await probeStatus('live', '/live');
  await probeBodyContains('city-lagos', '/city/lagos', 'Lagos');
  await probeStatus('login', '/login');
  await probeBodyContains('sitemap', '/sitemap.xml', '/city/');
  await probeJson('coins-methods', '/api/coins/methods');
  await probeSupabase();
  if (failures > 0) {
    console.log(`Done: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log('Done: all probes passed');
}

main().catch((err) => {
  console.log(`FAIL runner ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
