-- Intima migration 058: record what a connection request is for.
--
-- Connections already carry proposed_rate_ngn (the client's offer),
-- but nothing recorded WHAT the offer is for: a short time, an
-- overnight, a dinner date. Add connections.service_type, nullable
-- and constrained to the known keys, so the companion sees the
-- intent next to the offer and the negotiation in chat starts from
-- the right rate. Older connections simply have no pick (null).
alter table public.connections
  add column if not exists service_type text;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.connections'::regclass
      and contype = 'c'
      and conname = 'connections_service_type_check'
  loop
    execute format('alter table public.connections drop constraint %I', c.conname);
  end loop;
  alter table public.connections
    add constraint connections_service_type_check
    check (service_type is null or service_type in (
      'short_time', 'overnight', 'weekend', 'dinner-date',
      'travel', 'video-call', 'voice-call', 'other'
    ));
end $$;
