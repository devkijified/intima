-- 023: companion bios.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
