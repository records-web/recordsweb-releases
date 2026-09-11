-- RecordsWeb 3.3.4 — community-scoped Roblox roleplay patient identities
-- Run after RecordsWeb 3.3.3 / the 3.2.3 Roblox integration migration.
--
-- One Roblox user may have one persistent patient identity in each RecordsWeb
-- community. The same Roblox user can therefore use a different RP patient in
-- another community. No cross-community patient matching is performed here.

begin;

alter table public.recordsweb_roblox_integrations
  add column if not exists patient_identity_enabled boolean not null default true;

create table if not exists public.recordsweb_roblox_patient_identities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  roblox_user_id text not null,
  roblox_username text,
  roblox_display_name text,
  patient_id uuid not null references public.patients(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_seen_universe_id text,
  last_seen_place_id text,
  last_seen_server_id text,
  constraint recordsweb_roblox_patient_identity_user_id_format
    check (roblox_user_id ~ '^[0-9]{1,20}$')
);

create unique index if not exists recordsweb_roblox_patient_identity_org_user_unique
  on public.recordsweb_roblox_patient_identities (organisation_id, roblox_user_id);

create unique index if not exists recordsweb_roblox_patient_identity_patient_unique
  on public.recordsweb_roblox_patient_identities (patient_id);

create index if not exists recordsweb_roblox_patient_identity_org_idx
  on public.recordsweb_roblox_patient_identities (organisation_id, created_at desc);

create index if not exists recordsweb_roblox_patient_identity_last_seen_idx
  on public.recordsweb_roblox_patient_identities (organisation_id, last_seen_at desc);

-- Prevent an identity row from linking a patient belonging to another community.
create or replace function public.recordsweb_validate_roblox_patient_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_patient_org uuid;
begin
  select organisation_id into v_patient_org
  from public.patients
  where id = new.patient_id;

  if v_patient_org is null then
    raise exception 'The linked RecordsWeb patient does not exist.' using errcode = '23503';
  end if;

  if v_patient_org is distinct from new.organisation_id then
    raise exception 'A Roblox roleplay identity cannot link to a patient in another RecordsWeb community.' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.recordsweb_validate_roblox_patient_identity() from public;

drop trigger if exists recordsweb_validate_roblox_patient_identity on public.recordsweb_roblox_patient_identities;
create trigger recordsweb_validate_roblox_patient_identity
before insert or update of organisation_id, patient_id, roblox_user_id, roblox_username, roblox_display_name
on public.recordsweb_roblox_patient_identities
for each row execute function public.recordsweb_validate_roblox_patient_identity();

alter table public.recordsweb_roblox_patient_identities enable row level security;

-- These mappings contain Roblox account identifiers and patient links. They are
-- deliberately server-to-server only. Browser/app clients never receive direct
-- table access; Management and Roblox servers use Edge Functions.
revoke all on table public.recordsweb_roblox_patient_identities from anon, authenticated;

-- Reuse the existing billing read-only guard where available. Service-role
-- requests from the Edge Function bypass the trigger, while any future direct
-- authenticated write path remains protected.
do $$
begin
  if to_regprocedure('public.recordsweb_enforce_billing_write_access()') is not null then
    execute 'drop trigger if exists recordsweb_billing_write_guard on public.recordsweb_roblox_patient_identities';
    execute 'create trigger recordsweb_billing_write_guard before insert or update or delete on public.recordsweb_roblox_patient_identities for each row execute function public.recordsweb_enforce_billing_write_access()';
  end if;
end $$;

comment on column public.recordsweb_roblox_integrations.patient_identity_enabled is
  'Allows the authorised Roblox experience to resolve/create persistent community-scoped roleplay patient identities.';

comment on table public.recordsweb_roblox_patient_identities is
  'One persistent Roblox-user-to-patient mapping per RecordsWeb community. Identities are never matched across communities automatically.';

commit;
