-- RecordsWeb 3.2.1 — organisation-scoped request reviewers
-- Run this if recordsweb-3.2.1-review-request.sql was already applied when the
-- reviewer was restricted to a single Gmail address. Safe to re-run.
--
-- Reviewer identity rule:
--   gus.farnsworth@XX.XX
-- where XX.XX is the active organisation code on that user's RecordsWeb profile.

begin;

create or replace function public.recordsweb_is_access_request_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with reviewer_identity as (
    select
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) as email,
      lower(coalesce(public.current_organisation_code(), '')) as organisation_code
  )
  select coalesce((
    select
      email ~ '^gus\.farnsworth@[a-z]{2}\.[a-z]{2}$'
      and split_part(email, '@', 2) = organisation_code
    from reviewer_identity
  ), false);
$$;

revoke all on function public.recordsweb_is_access_request_reviewer() from public;
grant execute on function public.recordsweb_is_access_request_reviewer() to authenticated;

drop policy if exists "recordsweb_access_request_logo_reviewer_select" on storage.objects;
create policy "recordsweb_access_request_logo_reviewer_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'recordsweb-access-request-logos'
  and public.recordsweb_is_access_request_reviewer()
);

commit;
