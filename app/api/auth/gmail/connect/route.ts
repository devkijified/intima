import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

/**
 * GET /api/auth/gmail/connect
 * Starts the one-time Gmail OAuth flow for transfer alert polling.
 * Admin only. Redirects to Google's consent screen.
 */
export async function GET(req: NextRequest) {
  // Basic admin check via query param is NOT enough: verify session.
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const appUrl = new URL(req.url).origin;
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${appUrl}/api/auth/gmail/callback`
  );

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // ensures we get a refresh token
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  });

  return NextResponse.redirect(url);
}
