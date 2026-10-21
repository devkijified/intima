import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/mail/mailer';
import { buildEventEmail } from '@/lib/mail/templates';
import { siteOrigin } from '@/lib/links';

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return profile?.role === 'admin' || profile?.role === 'super_admin' ? user : null;
}

/**
 * POST /api/admin/mail-test
 * Sends one branded test email to the calling admin's own account
 * address and reports what Brevo said, so event-email delivery can be
 * proven end to end once BREVO_API_KEY is set. When the key is
 * missing the mailer skips, and this route says so plainly instead of
 * pretending a send happened.
 */
export async function POST() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  }
  if (!user.email) {
    return NextResponse.json(
      { error: 'Your admin account has no email address' },
      { status: 400 }
    );
  }

  const content = buildEventEmail({
    title: 'Intima email is working',
    body: 'This is a test message from the admin mail check. If it arrived, transactional event emails can reach users on this setup.',
    link: '/admin',
    appUrl: siteOrigin(),
    buttonLabel: 'Open admin',
  });

  const result = await sendEmail({
    to: user.email,
    subject: 'Intima email test',
    html: content.html,
    text: content.text,
  });

  if (result.skipped) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      brevoStatus: null,
      to: user.email,
      error: 'BREVO_API_KEY is not set, so no email was sent',
    });
  }
  return NextResponse.json(
    {
      ok: result.ok,
      skipped: false,
      brevoStatus: result.status,
      to: user.email,
    },
    { status: result.ok ? 200 : 502 }
  );
}
