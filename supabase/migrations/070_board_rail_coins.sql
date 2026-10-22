-- 070: Board requests can be paid from the coin wallet. The
-- payment_rail check from migration 062 only knew card and
-- crypto; 'coins' joins it. Coin fee spends and refunds ride the
-- coin_ledger kinds added in migration 066 (connection_fee,
-- board_fee).

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.board_requests'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_rail%'
  loop
    execute format('alter table public.board_requests drop constraint %I', c.conname);
  end loop;
  alter table public.board_requests
    add constraint board_requests_payment_rail_check
    check (payment_rail in ('card', 'crypto', 'coins'));
end $$;
