-- 075: shelf featuring. One comic can hold the featured spot; it
-- renders as the big banner at the top of the shelf, seen first.
-- The admin toggle is exclusive: featuring one comic unfeatures
-- any other (enforced in the admin route, not the schema).

ALTER TABLE public.comics
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
