import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/check-email
 * Body: { email }. Returns { exists: boolean }.
 *
 * The forgot password page calls this before sending a reset email so
 * a typo gets an honest "no account uses that email" instead of a fake
 * "Check your email". This intentionally reveals whether an email has
 * an account: the product owner explicitly chose that UX.
 *
 * The Auth admin API in this SDK version has no get-user-by-email, so
 * we page through listUsers until a case-insensitive match or the
 * pages run out (200 per page, capped at 25 pages).
 */
export async function POST(req: NextRequest) {
  let email = '';
  try {
    const body = await req.json();
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!EMAIL_SHAPE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }

  const svc = service();
  const perPage = 200;
  const maxPages = 25;
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json({ error: 'Could not check that email' }, { status: 500 });
    }
    const users = data?.users ?? [];
    if (users.some((u) => (u.email ?? '').toLowerCase() === email)) {
      return NextResponse.json({ exists: true });
    }
    if (users.length < perPage) break;
  }
  return NextResponse.json({ exists: false });
}
