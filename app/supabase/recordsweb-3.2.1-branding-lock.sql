-- RecordsWeb fixed-branding lock
-- Keeps the product identity identical across every organisation.
-- Organisation names, codes, modes and locations remain tenant-specific.

begin;

-- Normalise any branding values saved by older RecordsWeb versions.
update public.organisations
set
  primary_color = '#0f6fbd',
  navigation_color = '#cfe7f8',
  patient_banner_color = '#753b0d',
  logo_data_url = null,
  logo_path = null,
  logo_file_name = null,
  logo_updated_at = null;

-- Enforce the product-owned brand even if an older client attempts to update
-- these columns directly. This preserves all non-brand organisation fields.
create or replace function public.recordsweb_enforce_fixed_branding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.primary_color := '#0f6fbd';
  new.navigation_color := '#cfe7f8';
  new.patient_banner_color := '#753b0d';
  new.logo_data_url := null;
  new.logo_path := null;
  new.logo_file_name := null;
  new.logo_updated_at := null;
  return new;
end;
$$;

drop trigger if exists recordsweb_fixed_branding on public.organisations;
create trigger recordsweb_fixed_branding
before insert or update on public.organisations
for each row execute function public.recordsweb_enforce_fixed_branding();

-- Organisation branding uploads are no longer part of RecordsWeb. Existing
-- files are left intact for safe migration/history, but the bucket is private
-- and normal authenticated users can no longer insert, replace or delete them.
update storage.buckets
set public = false
where id = 'recordsweb-branding';

drop policy if exists "recordsweb_branding_management_insert" on storage.objects;
drop policy if exists "recordsweb_branding_management_update" on storage.objects;
drop policy if exists "recordsweb_branding_management_delete" on storage.objects;

-- Keep the legacy RPC shape for older clients, but never expose tenant branding
-- values. New RecordsWeb clients only use identity/configuration fields.
create or replace function public.recordsweb_public_organisation_config(
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
  logo_updated_at timestamptz
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
    '#0f6fbd'::text,
    '#cfe7f8'::text,
    '#753b0d'::text,
    null::text,
    null::text,
    null::text,
    null::timestamptz
  from public.organisations o
  where o.org_code = v_code
  limit 1;
end;
$$;

revoke all on function public.recordsweb_public_organisation_config(text) from public;
grant execute on function public.recordsweb_public_organisation_config(text) to anon, authenticated;

commit;
