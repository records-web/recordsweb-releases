-- RecordsWeb 3.2.4 — per-community branding
-- Community management may customise its own icon and clinical interface colours.
-- The RecordsWeb product name and platform/public website branding remain product-owned.

begin;

alter table public.organisations add column if not exists primary_color text not null default '#0f6fbd';
alter table public.organisations add column if not exists navigation_color text not null default '#cfe7f8';
alter table public.organisations add column if not exists patient_banner_color text not null default '#753b0d';
alter table public.organisations add column if not exists logo_data_url text;
alter table public.organisations add column if not exists logo_path text;
alter table public.organisations add column if not exists logo_file_name text;
alter table public.organisations add column if not exists logo_updated_at timestamptz;

drop trigger if exists recordsweb_fixed_branding on public.organisations;
drop function if exists public.recordsweb_enforce_fixed_branding();

create or replace function public.recordsweb_validate_community_branding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.primary_color is null or new.primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid primary community colour.';
  end if;

  if new.navigation_color is null or new.navigation_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid navigation community colour.';
  end if;

  if new.patient_banner_color is null or new.patient_banner_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid patient banner community colour.';
  end if;

  if new.logo_path is not null and trim(new.logo_path) <> '' then
    if new.id is null or new.logo_path not like (new.id::text || '/%') then
      raise exception 'Community logo path must belong to the same organisation.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists recordsweb_validate_community_branding on public.organisations;
create trigger recordsweb_validate_community_branding
before insert or update of primary_color, navigation_color, patient_banner_color, logo_path
on public.organisations
for each row execute function public.recordsweb_validate_community_branding();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordsweb-branding',
  'recordsweb-branding',
  true,
  4194304,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recordsweb_branding_management_insert" on storage.objects;
drop policy if exists "recordsweb_branding_management_update" on storage.objects;
drop policy if exists "recordsweb_branding_management_delete" on storage.objects;

create policy "recordsweb_branding_management_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create policy "recordsweb_branding_management_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
)
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create policy "recordsweb_branding_management_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

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
    o.primary_color,
    o.navigation_color,
    o.patient_banner_color,
    o.logo_data_url,
    o.logo_path,
    o.logo_file_name,
    o.logo_updated_at
  from public.organisations o
  where o.org_code = v_code
  limit 1;
end;
$$;

revoke all on function public.recordsweb_public_organisation_config(text) from public;
grant execute on function public.recordsweb_public_organisation_config(text) to anon, authenticated;

commit;
