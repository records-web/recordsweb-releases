-- RecordsWeb organisation provisioning example
-- Run supabase/recordsweb-3.1.9-multi-organisation.sql first.
-- Replace the example values before running.

-- 1) Approve/create the organisation.
select (public.recordsweb_provision_organisation(
  'AB.CD',                         -- extension shown to staff as @AB.CD
  'Example Health Organisation',  -- organisation display name
  'general_practice',              -- general_practice or hospital
  'Main Site'                      -- footer/default location
)).*;

-- 2) In Supabase Dashboard > Authentication > Users, create the first manager.
--    Email example: manager.name@ab.cd
--    Confirm the email, then copy the Auth user UUID.
--
-- 3) Replace AUTH-USER-UUID and run this profile bootstrap statement.
-- insert into public.profiles (
--   id,
--   organisation_id,
--   username,
--   title,
--   first_name,
--   last_name,
--   display_name,
--   role,
--   roles,
--   is_management,
--   active,
--   must_change_password
-- )
-- select
--   'AUTH-USER-UUID'::uuid,
--   o.id,
--   'manager.name@AB.CD',
--   'Dr',
--   'Manager',
--   'Name',
--   'Dr Manager Name',
--   'Practice Manager',
--   array['Practice Manager']::text[],
--   true,
--   true,
--   true
-- from public.organisations o
-- where o.org_code = 'AB.CD';
--
-- Once this manager can sign in, further accounts are created normally from
-- RecordsWeb Management and automatically use the same @AB.CD namespace.
