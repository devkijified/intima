-- 053: Public settings read for signed-out visitors.
--
-- platform_settings has no anonymous read policy, on purpose: it
-- also holds secrets (gmail_refresh_token). But public pages read
-- the connection fee through lib/settings/platformSettings, and
-- for signed-out visitors that read returns zero rows, the
-- .single() call answers 406, and the helper silently falls back
-- to hardcoded defaults. That means an admin fee change would
-- never reach signed-out visitors, and every landing load logs a
-- console error.
--
-- This function returns a setting value only for an explicit
-- whitelist of display-safe keys. It is security definer so it
-- can read the table, but the whitelist is the boundary: secrets
-- can never be read through it, now or by future keys.

create or replace function public.get_public_setting(p_key text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select value::jsonb
  from platform_settings
  where key = p_key
    and p_key in (
      'connection_fee_ngn',
      'gift_platform_cut_pct',
      'subscription_platform_cut_pct',
      'cashout_min_coins',
      'usd_ngn_rate',
      'bank_name',
      'bank_account_name',
      'bank_account_number'
    )
$$;

grant execute on function public.get_public_setting(text) to anon, authenticated;
