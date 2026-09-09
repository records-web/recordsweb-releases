-- RecordsWeb 3.2.2 — website-only platform community management
-- Run after recordsweb-3.2.2-community-creation.sql and the platform-management migration.
-- The operator-only Edge Function performs community writes. This migration
-- ensures disabling an organisation immediately closes its RLS boundary,
-- including for already-authenticated community sessions.

begin;

create or replace function public.current_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organisation_id
  from public.profiles p
  join public.organisations o on o.id = p.organisation_id
  where p.id = auth.uid()
    and p.active = true
    and o.active = true
  limit 1
$$;

revoke all on function public.current_organisation_id() from public;
grant execute on function public.current_organisation_id() to authenticated;

create or replace function public.current_user_is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_management
    from public.profiles p
    join public.organisations o on o.id = p.organisation_id
    where p.id = auth.uid()
      and p.active = true
      and o.active = true
    limit 1
  ), false)
$$;

revoke all on function public.current_user_is_management() from public;
grant execute on function public.current_user_is_management() to authenticated;

create or replace function public.current_organisation_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select o.org_code
  from public.profiles p
  join public.organisations o on o.id = p.organisation_id
  where p.id = auth.uid()
    and p.active = true
    and o.active = true
  limit 1
$$;

revoke all on function public.current_organisation_code() from public;
grant execute on function public.current_organisation_code() to authenticated;

-- Keep the operator list as the supported read surface for Platform Management.
create or replace function public.recordsweb_operator_list_organisations()
returns table (
  id uuid,
  org_code text,
  name text,
  system_mode text,
  default_location text,
  active boolean,
  created_at timestamptz,
  has_reserved_operator boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.recordsweb_is_platform_operator() then
    raise exception 'Access denied: RecordsWeb platform operator permission is required.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.org_code,
    o.name,
    o.system_mode,
    o.default_location,
    o.active,
    o.created_at,
    exists (
      select 1
      from public.profiles p
      where p.organisation_id = o.id
        and p.active = true
        and lower(p.username) = lower('gus.farnsworth@' || o.org_code)
    ) as has_reserved_operator
  from public.organisations o
  order by lower(o.name), o.org_code;
end;
$$;

revoke all on function public.recordsweb_operator_list_organisations() from public;
grant execute on function public.recordsweb_operator_list_organisations() to authenticated;

commit;
