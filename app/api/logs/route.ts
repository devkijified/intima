import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * POST /api/logs
 * Receives client error reports from ErrorReporter and stores them in
 * error_logs via the service role. Deliberately forgiving: it never
 * throws, truncates aggressively, strips anything that looks like a
 * secret, and rate limits per IP so a crashing client cannot flood
 * the table.
 */

const MAX_PER_MINUTE = 20;
const WINDOW_MS = 60 * 1000;

const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_MINUTE;
}

const SECRET_KEYS = new Set(['token', 'secret', 'password', 'authorization', 'apikey', 'api_key']);

function stripSecrets(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    if (rateLimited(ip)) {
      return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 });
    }

    const raw = (await req.json().catch(() => null)) as unknown;
    const body = stripSecrets(raw);

    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : '';
    if (!message) {
      return NextResponse.json({ ok: true });
    }
    const route = typeof body.route === 'string' ? body.route.slice(0, 500) : null;
    const stack = typeof body.stack === 'string' ? body.stack.slice(0, 2000) : null;

    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await svc.from('error_logs').insert({
      message,
      route,
      source: 'client',
      stack_head: stack,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Logging must never break the caller.
    return NextResponse.json({ ok: true });
  }
}
