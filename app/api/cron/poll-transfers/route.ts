import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

/**
 * GET /api/cron/poll-transfers
 * Vercel Cron (every 5 min): reads UBA credit alert emails via Gmail API,
 * extracts the INT-XXXXXX reference + amount, and credits matching intents.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Gmail access via the refresh token stored by /admin/email-setup.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization');
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Gmail refresh token from settings.
    const { data: tokenRow } = await svc
      .from('platform_settings')
      .select('value')
      .eq('key', 'gmail_refresh_token')
      .maybeSingle();
    const refreshToken = tokenRow?.value;
    if (!refreshToken) {
      return NextResponse.json({ ok: true, skipped: 'gmail not connected' });
    }

    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    // Recent UBA credit alerts.
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:uba newer_than:15m subject:"credit alert"',
      maxResults: 20,
    });
    const messages = list.data.messages ?? [];
    let credited = 0;
    const notes: string[] = [];

    for (const m of messages) {
      if (!m.id) continue;
      const full = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
      const body = JSON.stringify(full.data);

      const refMatch = body.match(/\bINT-[A-Z0-9]{6}\b/);
      if (!refMatch) {
        notes.push(`${m.id}: no reference`);
        continue;
      }
      const reference = refMatch[0];

      // Amount: try common UBA alert formats.
      let amount: number | null = null;
      const amtPatterns = [
        /(?:Amt|Amount)[:\s]+NGN\s*([\d,]+\.\d{2})/i,
        /NGN\s*([\d,]+\.\d{2})/,
        /(?:credited with|credit of)\s*[₦N]?\s*([\d,]+\.\d{2})/i,
      ];
      for (const pat of amtPatterns) {
        const amtMatch = body.match(pat);
        if (amtMatch) {
          amount = Math.round(parseFloat(amtMatch[1].replace(/,/g, '')));
          break;
        }
      }
      if (!amount) {
        notes.push(`${m.id}: no amount parsed`);
        continue;
      }

      // Match a pending intent.
      const { data: intent } = await svc
        .from('transfer_intents')
        .select('id, user_id, coins, amount_ngn, status, expires_at')
        .eq('reference', reference)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!intent) {
        notes.push(`${reference}: no pending intent`);
        continue;
      }
      if (intent.amount_ngn !== amount) {
        notes.push(`${reference}: amount mismatch (expected ${intent.amount_ngn}, got ${amount})`);
        continue;
      }

      // Credit coins via the ledger.
      const { error: creditErr } = await svc.rpc('credit_coins', {
        p_user_id: intent.user_id,
        p_amount: intent.coins,
        p_kind: 'topup_transfer',
        p_ref: `transfer-${reference}`,
        p_meta: {},
      });
      if (creditErr) throw creditErr;
      await svc.from('transfer_intents').update({
        status: 'credited',
        credited_at: new Date().toISOString(),
      }).eq('id', intent.id);
      await svc.from('coin_topups').insert({
        user_id: intent.user_id,
        reference: `transfer-${reference}-${m.id}`,
        coins: intent.coins,
        amount_ngn: intent.amount_ngn,
      });

      credited++;
      notes.push(`${reference}: credited ${intent.coins} coins`);
    }

    return NextResponse.json({ ok: true, checked: messages.length, credited, notes });
  } catch (e) {
    console.error('[poll-transfers]', e);
    return NextResponse.json({ error: 'Poller failed' }, { status: 500 });
  }
}
