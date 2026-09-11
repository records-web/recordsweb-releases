-- RecordsWeb 3.2.0 - Multi-organisation deployment support
--
-- Adds organisation installation namespaces (for example @GW.HC), organisation
-- mode metadata, safe pre-login organisation discovery, automatic organisation
-- scoping for patient creation, dynamic Storage RLS and organisation provisioning.
--
-- Safe to re-run after the existing RecordsWeb schema/migrations.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organisation metadata and namespace validation
-- ---------------------------------------------------------------------------

alter table public.organisations
  add column if not exists active boolean not null default true,
  add column if not exists system_mode text not null default 'general_practice',
  add column if not exists default_location text not null default 'Main Site';

-- Existing RecordsWeb organisation codes are normalised before enforcing the
-- four-letter XX.XX namespace format.
update public.organisations
set org_code = upper(trim(org_code));

update public.organisations
set
  system_mode = case when system_mode = 'hospital' then 'hospital' else 'general_practice' end,
  default_location = case
    when org_code = 'GW.HC' and (default_location is null or trim(default_location) = '' or default_location = 'Main Site') then 'Main Building'
    when default_location is null or trim(default_location) = '' then 'Main Site'
    else trim(default_location)
  end;

update public.organisations
set active = true
where active is null;

do $$
begin
  if exists (
    select 1
    from public.organisations
    where org_code !~ '^[A-Z]{2}\.[A-Z]{2}$'
  ) then
    raise exception 'RecordsWeb multi-organisation migration stopped: every organisations.org_code must use the XX.XX format before this migration can continue.';
  end if;
end $$;

do $$ begin
  alter table public.organisations
    add constraint organisations_org_code_format
    check (org_code ~ '^[A-Z]{2}\.[A-Z]{2}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.organisations
    add constraint organisations_system_mode_allowed
    check (system_mode in ('general_practice', 'hospital'));
exception when duplicate_object then null; end $$;

create or replace function public.recordsweb_normalise_organisation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.org_code := upper(regexp_replace(trim(coalesce(new.org_code, '')), '^@+', ''));
  new.name := trim(coalesce(new.name, ''));
  new.system_mode := lower(trim(coalesce(new.system_mode, 'general_practice')));
  new.default_location := trim(coalesce(new.default_location, 'Main Site'));

  if new.org_code !~ '^[A-Z]{2}\.[A-Z]{2}$' then
    raise exception 'Organisation extension must use four letters in the format @XX.XX.';
  end if;
  if new.name = '' then
    raise exception 'Organisation name is required.';
  end if;
  if new.system_mode not in ('general_practice', 'hospital') then
    raise exception 'RecordsWeb mode must be general_practice or hospital.';
  end if;
  if new.default_location = '' then
    new.default_location := 'Main Site';
  end if;

  return new;
end;
$$;

drop trigger if exists recordsweb_normalise_organisation on public.organisations;
create trigger recordsweb_normalise_organisation
before insert or update of org_code, name, system_mode, default_location
on public.organisations
for each row execute function public.recordsweb_normalise_organisation();

-- Ensure the existing Grove Way deployment retains its current identity.
update public.organisations
set
  name = 'Grove Way Health Centre',
  system_mode = 'general_practice',
  default_location = 'Main Building',
  active = true
where org_code = 'GW.HC';

-- ---------------------------------------------------------------------------
-- Current organisation helpers
-- ---------------------------------------------------------------------------

-- Replace the legacy helper so an organisation being disabled immediately
-- closes the RLS boundary for its clinical data, even for an already-open
-- authenticated session. The helper remains SECURITY DEFINER so it can safely
-- inspect the staff profile and organisation while those tables use RLS.
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
  where p.id = auth.uid() and p.active = true and o.active = true
  limit 1
$$;

revoke all on function public.current_organisation_code() from public;
grant execute on function public.current_organisation_code() to authenticated;

-- Public, deliberately limited organisation lookup used before login. It does
-- not expose staff, patient or configuration secrets.
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

-- The organisations table itself is no longer anonymously readable. Before
-- login, the app uses the compact RPC above. After login, staff can only read
-- their own organisation row.
alter table public.organisations enable row level security;
revoke select on public.organisations from anon;
grant select on public.organisations to authenticated;

drop policy if exists "organisation_read" on public.organisations;
create policy "organisation_read"
on public.organisations
for select
to authenticated
using (id = public.current_organisation_id());

-- ---------------------------------------------------------------------------
-- Enforce the @XX.XX namespace on staff profiles
-- ---------------------------------------------------------------------------

create or replace function public.recordsweb_validate_profile_namespace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_username text;
  v_local text;
  v_domain text;
begin
  select o.org_code into v_code
  from public.organisations o
  where o.id = new.organisation_id and o.active = true;

  if v_code is null then
    raise exception 'The RecordsWeb organisation is missing or inactive.';
  end if;

  v_username := trim(coalesce(new.username, ''));
  if v_username = '' then
    raise exception 'RecordsWeb username is required.';
  end if;

  if position('@' in v_username) = 0 then
    v_local := lower(v_username);
    v_domain := v_code;
  else
    v_local := lower(split_part(v_username, '@', 1));
    v_domain := upper(regexp_replace(trim(substring(v_username from position('@' in v_username) + 1)), '^@+', ''));
  end if;

  if v_local = '' or v_domain <> v_code then
    raise exception 'RecordsWeb username must use the @% organisation extension.', v_code;
  end if;

  new.username := v_local || '@' || v_code;
  return new;
end;
$$;

drop trigger if exists recordsweb_validate_profile_namespace on public.profiles;
create trigger recordsweb_validate_profile_namespace
before insert or update of username, organisation_id
on public.profiles
for each row execute function public.recordsweb_validate_profile_namespace();

-- Normalise existing profile usernames where the account already belongs to
-- its matching organisation. Legacy local-only usernames receive the correct
-- suffix. This does not alter auth.users email addresses.
update public.profiles p
set username = case
  when position('@' in trim(coalesce(p.username, ''))) = 0
    then lower(trim(p.username)) || '@' || o.org_code
  else lower(split_part(trim(p.username), '@', 1)) || '@' || o.org_code
end
from public.organisations o
where o.id = p.organisation_id
  and trim(coalesce(p.username, '')) <> ''
  and (
    position('@' in trim(p.username)) = 0
    or upper(substring(trim(p.username) from position('@' in trim(p.username)) + 1)) = o.org_code
  );

-- Refuse to leave an ambiguous or cross-organisation username in place. This
-- makes bad legacy data visible during migration rather than allowing a later
-- login or management action to behave unpredictably.
do $$
begin
  if exists (
    select 1
    from public.profiles p
    join public.organisations o on o.id = p.organisation_id
    where trim(coalesce(p.username, '')) = ''
       or position('@' in trim(p.username)) = 0
       or upper(substring(trim(p.username) from position('@' in trim(p.username)) + 1)) <> o.org_code
  ) then
    raise exception 'RecordsWeb multi-organisation migration stopped: one or more profiles have a username that does not match their organisation extension. Correct those profile usernames, then run this migration again.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Automatic organisation scoping
-- ---------------------------------------------------------------------------

-- Existing RecordsWeb already scopes organisation-level tables with this
-- trigger function. Patients now use the same mechanism so the renderer never
-- has to know or trust an organisation UUID when creating a patient.
drop trigger if exists patients_set_org on public.patients;
create trigger patients_set_org
before insert on public.patients
for each row execute function public.recordsweb_set_org();

-- ---------------------------------------------------------------------------
-- Multi-organisation branding Storage RLS
-- ---------------------------------------------------------------------------

-- New uploads are stored under <organisation UUID>/..., while the legacy Grove
-- Way path remains readable/manageable so existing logos continue to work.
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
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
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
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
);

-- ---------------------------------------------------------------------------
-- Multi-organisation clinical document Storage RLS
-- ---------------------------------------------------------------------------

-- Existing Grove Way PDFs used grove-way-health-centre/<patient UUID>/... .
-- Keep that legacy path available only to GW.HC while all new files use the
-- organisation UUID as their first path segment.
drop policy if exists "recordsweb_documents_read" on storage.objects;
drop policy if exists "recordsweb_documents_insert" on storage.objects;
drop policy if exists "recordsweb_documents_update" on storage.objects;
drop policy if exists "recordsweb_documents_delete" on storage.objects;

create policy "recordsweb_documents_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-documents'
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
)
with check (
  bucket_id = 'recordsweb-documents'
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

-- ---------------------------------------------------------------------------
-- Organisation-aware maintenance state
-- ---------------------------------------------------------------------------

insert into public.system_maintenance (organisation_code, organisation_id)
select o.org_code, o.id
from public.organisations o
on conflict (organisation_code) do update
set organisation_id = excluded.organisation_id;

create or replace function public.recordsweb_public_maintenance_state(
  p_organisation_code text default null
)
returns table (
  organisation_code text,
  enabled boolean,
  message text,
  estimated_end_at timestamptz,
  enabled_at timestamptz,
  enabled_by_name text,
  updated_at timestamptz
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

  return query
  select
    m.organisation_code,
    m.enabled,
    m.message,
    m.estimated_end_at,
    m.enabled_at,
    m.enabled_by_name,
    m.updated_at
  from public.system_maintenance m
  join public.organisations o on o.id = m.organisation_id
  where m.organisation_code = v_code
    and o.active = true
  limit 1;

  if not found then
    return query select
      v_code::text,
      false,
      'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.'::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::timestamptz;
  end if;
end;
$$;

revoke all on function public.recordsweb_public_maintenance_state(text) from public;
grant execute on function public.recordsweb_public_maintenance_state(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Operator-only organisation provisioning helper
-- ---------------------------------------------------------------------------

create or replace function public.recordsweb_provision_organisation(
  p_org_code text,
  p_name text,
  p_system_mode text default 'general_practice',
  p_default_location text default 'Main Site'
)
returns public.organisations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_mode text;
  v_name text;
  v_location text;
  v_org public.organisations%rowtype;
begin
  v_code := upper(regexp_replace(trim(coalesce(p_org_code, '')), '^@+', ''));
  v_mode := lower(trim(coalesce(p_system_mode, 'general_practice')));
  v_name := trim(coalesce(p_name, ''));
  v_location := trim(coalesce(p_default_location, 'Main Site'));

  if v_code !~ '^[A-Z]{2}\.[A-Z]{2}$' then
    raise exception 'Organisation extension must use four letters in the format @XX.XX.';
  end if;
  if v_name = '' then
    raise exception 'Organisation name is required.';
  end if;
  if v_mode not in ('general_practice', 'hospital') then
    raise exception 'RecordsWeb mode must be general_practice or hospital.';
  end if;
  if v_location = '' then v_location := 'Main Site'; end if;

  insert into public.organisations (
    org_code, name, system_mode, default_location, active
  ) values (
    v_code, v_name, v_mode, v_location, true
  )
  on conflict (org_code) do update set
    name = excluded.name,
    system_mode = excluded.system_mode,
    default_location = excluded.default_location,
    active = true
  returning * into v_org;

  insert into public.system_maintenance (organisation_code, organisation_id)
  values (v_org.org_code, v_org.id)
  on conflict (organisation_code) do update
  set organisation_id = excluded.organisation_id;

  return v_org;
end;
$$;

-- This helper is intentionally not exposed to the RecordsWeb client. Run it as
-- the database owner in the Supabase SQL Editor, or from a trusted service-role
-- backend when approving a new organisation.
revoke all on function public.recordsweb_provision_organisation(text, text, text, text) from public, anon, authenticated;
grant execute on function public.recordsweb_provision_organisation(text, text, text, text) to service_role;

-- Example (run manually when an organisation is approved):
-- select (public.recordsweb_provision_organisation(
--   'AB.CD',
--   'Example Health Organisation',
--   'general_practice', -- or 'hospital'
--   'Main Site'
-- )).*;
--
-- Then create the organisation's first manager in Supabase Authentication and
-- insert the matching public.profiles row using that organisation's UUID.
