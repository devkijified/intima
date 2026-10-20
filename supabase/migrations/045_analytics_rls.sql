-- Intima migration 045: provider analytics read access.
--
-- The /analytics page counts a provider's favorites and followers.
-- Both tables were created with owner-side policies only: favorites
-- rows are readable by the client who saved them, broadcast_follows
-- rows by the follower. A provider could not count her own totals,
-- so analytics undercounted. These SELECT policies let a provider
-- read the rows that point at her, nothing more. Writes stay with
-- the original owner-side policies.

drop policy if exists "Providers can read favorites of themselves" on public.favorites;
create policy "Providers can read favorites of themselves"
  on public.favorites for select
  using (auth.uid() = provider_id);

drop policy if exists "Providers can read their followers" on public.broadcast_follows;
create policy "Providers can read their followers"
  on public.broadcast_follows for select
  using (auth.uid() = provider_id);
