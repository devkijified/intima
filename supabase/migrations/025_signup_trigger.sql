-- 025: auto-create profile rows on signup via trigger.
-- Fixes the fragile client-side profile insert (RLS-blocked when email
-- confirmation is on, plus it wrote to the phantom model_profiles table).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_username text;
begin
  v_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1)
  );
  -- Usernames are unique; if taken, fall back to a suffixed variant.
  if exists (select 1 from public.profiles where username = v_username and id <> new.id) then
    v_username := v_username || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  insert into public.profiles (id, role, display_name, full_name, phone, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'client'),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    v_username
  )
  on conflict (id) do update set
    role = excluded.role,
    display_name = excluded.display_name,
    full_name = excluded.full_name,
    phone = excluded.phone,
    username = excluded.username;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
