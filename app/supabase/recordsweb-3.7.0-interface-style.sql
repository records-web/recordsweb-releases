-- RecordsWeb 3.7.0 — Classic / Modern interface defaults
-- Adds a community-level default interface style. Individual staff can override
-- this locally from Settings without changing clinical behaviour or permissions.

begin;

alter table public.organisations
  add column if not exists default_interface_style text not null default 'classic';

update public.organisations
set default_interface_style = 'classic'
where default_interface_style is null
   or default_interface_style not in ('classic', 'modern');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisations_default_interface_style_allowed'
  ) then
    alter table public.organisations
      add constraint organisations_default_interface_style_allowed
      check (default_interface_style in ('classic', 'modern'));
  end if;
end $$;

-- PostgreSQL cannot change a function's TABLE return shape with CREATE OR REPLACE,
-- so recreate the public organisation-config RPC with the new column appended.
drop function if exists public.recordsweb_public_organisation_config(text);

create function public.recordsweb_public_organisation_config(
  p_organisation_code text
)
returns table (
  id uuid,
  org_code text,
  name text,
  system_mode text,
  default_location text,
  active boolean,
  primary_color text,
  navigation_color text,
  patient_banner_color text,
  logo_data_url text,
  logo_path text,
  logo_file_name text,
  logo_updated_at timestamptz,
  default_interface_style text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  v_code := upper(regexp_replace(trim(coalesce(p_organisation_code, '')), '^@+', ''));

  if v_code !~ '^[A-Z]{2}\.[A-Z]{2}$' then
    return;
  end if;

  return query
  select
    o.id,
    o.org_code,
    o.name,
    o.system_mode,
    o.default_location,
    o.active,
    o.primary_color,
    o.navigation_color,
    o.patient_banner_color,
    o.logo_data_url,
    o.logo_path,
    o.logo_file_name,
    o.logo_updated_at,
    o.default_interface_style
  from public.organisations o
  where o.org_code = v_code
  limit 1;
end;
$$;

revoke all on function public.recordsweb_public_organisation_config(text) from public;
grant execute on function public.recordsweb_public_organisation_config(text) to anon, authenticated;

commit;
