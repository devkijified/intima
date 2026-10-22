-- Series story status (Ongoing / Completed), the way source sites label
-- their comics. Separate from the visibility status on the same table.
alter table public.comics
  add column if not exists story_status text not null default 'ongoing';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comics_story_status_check'
  ) then
    alter table public.comics
      add constraint comics_story_status_check
      check (story_status in ('ongoing', 'completed'));
  end if;
end $$;
