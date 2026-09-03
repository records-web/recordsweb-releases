-- RecordsWeb 2.5.4 staff-directory access update.
-- Safe to run in Supabase SQL Editor after the main schema is already installed.

drop policy if exists "profile_read" on public.profiles;
create policy "profile_read" on public.profiles for select
using (
  id = auth.uid()
  or (
    organisation_id = public.current_organisation_id()
    and (active = true or public.current_user_is_management())
  )
);
