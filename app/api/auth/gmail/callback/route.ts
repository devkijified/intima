import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/auth/gmail/callback?code=...
 * Exchanges the OAuth code for tokens, stores the refresh token in
 * platform_settings, then redirects back to the setup page.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const code = req.nextUrl.searchParams.get('code');
  const appUrl = new URL(req.url).origin;
  if (!code) {
    return NextResponse.redirect(new URL('/admin/email-setup?error=no_code', appUrl));
  }

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${appUrl}/api/auth/gmail/callback`
    );
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('No refresh token returned');
    }

    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await svc.from('platform_settings').upsert(
      {
        key: 'gmail_refresh_token',
        value: tokens.refresh_token,
        description: 'Gmail OAuth refresh token for transfer alert polling (set via /admin/email-setup)',
      },
      { onConflict: 'key' }
    );

    return NextResponse.redirect(new URL('/admin/email-setup?connected=1', appUrl));
  } catch (e) {
    console.error('[gmail/callback]', e);
    return NextResponse.redirect(new URL('/admin/email-setup?error=oauth_failed', appUrl));
  }
}
