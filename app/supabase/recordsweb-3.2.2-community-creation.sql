-- RecordsWeb 3.2.2 — website-only platform community creation
-- Run after the multi-organisation and platform-management migrations.
-- The actual Auth user creation is performed by the recordsweb-platform-admin
-- Edge Function with the service-role key; no service-role secret is exposed to Vite.

begin;

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
