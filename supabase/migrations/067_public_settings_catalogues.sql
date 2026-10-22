-- 067: The admin-editable catalogues (cities, city coords, vibe
-- and service presets) are display-safe, so they join the
-- get_public_setting whitelist: guests on the map need the city
-- list, and signed-out visitors meet the same presets everywhere.

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
      'bank_account_number',
      'cities',
      'city_coords',
      'preset_vibes',
      'preset_services'
    )
$$;

grant execute on function public.get_public_setting(text) to anon, authenticated;
