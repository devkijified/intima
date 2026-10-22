-- 072: Values the owner should control from Admin become settings:
-- the watermark line printed on companion media, and the refund
-- percentage for fee refunds. Both are seeded here so the Admin
-- Settings editor has rows to open, and both join the public
-- settings whitelist (the watermark shows on public media, and the
-- board page quotes the refund percentage to signed-out readers of
-- shared links).

insert into public.platform_settings (key, value, description)
values
  ('watermark_text',
   '""'::jsonb,
   'The text printed on companion photos and videos, with her username joined to it (for example yourwebsitename). Leave empty to use the live domain automatically. Edited in Admin, Settings.'),
  ('refund_pct',
   '85'::jsonb,
   'The percentage of a fee that is refunded when a refund is due (board requests unfilled or cancelled, and fee disputes). The platform keeps the rest. Edited in Admin, Settings.')
on conflict (key) do nothing;

insert into public.platform_settings (key, value, description)
values
  ('boost_cost_coins',
   '500'::jsonb,
   'What a 30 minute boost costs a companion, in coins. Edited in Admin, Settings.'),
  ('referral_reward_companion_coins',
   '500'::jsonb,
   'Coins a companion earns when someone who joined through her link opens their first paid connection. Edited in Admin, Settings.'),
  ('referral_reward_client_coins',
   '100'::jsonb,
   'Coins a client earns when someone who joined through their link opens their first paid connection. Edited in Admin, Settings.')
on conflict (key) do nothing;

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
      'preset_services',
      'watermark_text',
      'refund_pct',
      'boost_cost_coins',
      'referral_reward_companion_coins',
      'referral_reward_client_coins'
    )
$$;

grant execute on function public.get_public_setting(text) to anon, authenticated;
