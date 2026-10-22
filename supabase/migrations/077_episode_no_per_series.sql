-- 077: episode numbers are per-series, not global.
-- Migration 029 put a global UNIQUE constraint on comic_episodes.episode_no
-- (comic_episodes_episode_no_key) from the flat, pre-series design. Under the
-- series model every series numbers its own episodes from 1, so the second
-- series in the library could never receive an episode whose number already
-- existed anywhere else: inserts failed with 23505 and the page importer
-- surfaced it as a 502. Replace the global constraint with a per-series one.
-- Episodes with a NULL comic_id (legacy standalone rows) stay distinct under
-- the index, since Postgres treats NULLs as not equal.

alter table public.comic_episodes
  drop constraint if exists comic_episodes_episode_no_key;

create unique index if not exists comic_episodes_comic_episode_no_unique
  on public.comic_episodes (comic_id, episode_no);
