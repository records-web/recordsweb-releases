-- RecordsWeb 3.2.9 — additional platform operator identity
-- Run after the existing platform-management/review-request migrations.
-- Authorises both gus.farnsworth@XX.XX and alfie-james@XX.XX, provided the
-- XX.XX suffix matches the user's active RecordsWeb organisation profile.

begin;

create or replace function public.recordsweb_is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with operator_identity as (
    select
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) as email,
      lower(coalesce(public.current_organisation_code(), '')) as organisation_code
  )
  select coalesce((
    select
      email ~ '^(gus[.]farnsworth|alfie-james)@[a-z]{2}[.][a-z]{2}$'
      and split_part(email, '@', 2) = organisation_code
    from operator_identity
  ), false);
$$;

revoke all on function public.recordsweb_is_platform_operator() from public;
grant execute on function public.recordsweb_is_platform_operator() to authenticated;

-- Access-request review is part of Platform Management, so keep it aligned.
create or replace function public.recordsweb_is_access_request_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.recordsweb_is_platform_operator();
$$;

revoke all on function public.recordsweb_is_access_request_reviewer() from public;
grant execute on function public.recordsweb_is_access_request_reviewer() to authenticated;

commit;
