-- ============================================================================
-- RecordsWeb 3.3.9 — FULL REQUIRED DATABASE UPDATE
-- ============================================================================
--
-- Run this entire file in the Supabase SQL Editor.
--
-- Includes:
--   • v3.3.5 Problems end-date support
--   • v3.3.6 Shared Care Network
--       - GP <-> Hospital
--       - GP <-> Ambulance / PHEM
--       - Hospital <-> Ambulance / PHEM
--       - GP <-> GP
--       - Hospital <-> Hospital
--       - Ambulance <-> Ambulance
--       - Multiple simultaneous links, allowing wider networks such as
--         Ambulance <-> Hospital <-> GP while preserving pair-by-pair approval
--   • Ambulance / PHEM organisation mode and staff roles
--   • Permanent six-character Shared Care community codes
--   • Shared patient matching, linking, permissions, snapshots and auditing
--   • v3.3.9 deployment-request received / approved / declined email tracking
--
-- FIX INCLUDED:
-- The previous Shared Care migration used gen_random_bytes(1) inside a function
-- with search_path = public. Supabase normally exposes pgcrypto functions from
-- the extensions schema, which caused ERROR 42883. This version no longer uses
-- gen_random_bytes(); it creates the code from PostgreSQL's built-in random UUID.
--
-- This migration expects the existing RecordsWeb schema/migrations to already
-- be installed (profiles, organisations, patients, audit_log, billing helpers,
-- Roblox patient identities, etc.).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- v3.3.5 — Problems: active/past problem end dates
-- ---------------------------------------------------------------------------

alter table public.problems
  add column if not exists end_date date;

comment on column public.problems.end_date is
  'Date the clinical problem ended/resolved. Null while the problem remains active.';

-- RecordsWeb 3.3.6 — Shared Care Network
-- Adds community-to-community linking, outbound sharing permissions, patient
-- record linking and secure cross-community patient snapshots.
-- Supports Primary Care, Secondary Care and Ambulance / PHEM communities.

begin;

-- ---------------------------------------------------------------------------
-- Organisation modes + permanent six-character Shared Care code
-- ---------------------------------------------------------------------------

alter table public.organisations
  add column if not exists shared_care_code text;

alter table public.organisations
  drop constraint if exists organisations_system_mode_allowed;

alter table public.organisations
  add constraint organisations_system_mode_allowed
  check (system_mode in ('general_practice', 'hospital', 'ambulance'));

create or replace function public.recordsweb_generate_shared_care_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  random_uuid uuid;
  i integer;
begin
  loop
    candidate := '';
    random_uuid := pg_catalog.gen_random_uuid();

    for i in 0..5 loop
      candidate := candidate || substr(
        alphabet,
        (pg_catalog.get_byte(pg_catalog.uuid_send(random_uuid), i) % length(alphabet)) + 1,
        1
      );
    end loop;

    exit when not exists (
      select 1
      from public.organisations o
      where o.shared_care_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

update public.organisations
set shared_care_code = public.recordsweb_generate_shared_care_code()
where shared_care_code is null
   or shared_care_code !~ '^[A-Z0-9]{6}$';

create unique index if not exists organisations_shared_care_code_unique_idx
  on public.organisations(shared_care_code);

do $$ begin
  alter table public.organisations
    add constraint organisations_shared_care_code_format
    check (shared_care_code ~ '^[A-Z0-9]{6}$');
exception when duplicate_object then null; end $$;

alter table public.organisations
  alter column shared_care_code set default public.recordsweb_generate_shared_care_code();

alter table public.organisations
  alter column shared_care_code set not null;

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
  if new.system_mode not in ('general_practice', 'hospital', 'ambulance') then
    raise exception 'RecordsWeb mode must be general_practice, hospital or ambulance.';
  end if;
  if new.default_location = '' then
    new.default_location := 'Main Site';
  end if;

  if new.shared_care_code is null or new.shared_care_code !~ '^[A-Z0-9]{6}$' then
    new.shared_care_code := public.recordsweb_generate_shared_care_code();
  end if;

  return new;
end;
$$;

-- The six-character linking code is permanent for the community. Community
-- sessions cannot rotate or spoof it; only service-role/platform maintenance
-- can deliberately change it.
create or replace function public.recordsweb_protect_shared_care_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.shared_care_code is distinct from old.shared_care_code
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres','supabase_admin','service_role') then
    raise exception 'The Shared Care code is managed by RecordsWeb and cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists recordsweb_protect_shared_care_code on public.organisations;
create trigger recordsweb_protect_shared_care_code
before update of shared_care_code on public.organisations
for each row execute function public.recordsweb_protect_shared_care_code();

-- ---------------------------------------------------------------------------
-- Ambulance / PHEM staff roles
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_allowed;
alter table public.profiles drop constraint if exists profiles_roles_allowed;

alter table public.profiles
  add constraint profiles_role_allowed check (role in (
    'GP Partner','Practice Manager','Assistant Manager','General Practitioner',
    'GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse',
    'Advanced Clinical Practitioner','General Practice Nurse','Nurse Associate',
    'Healthcare Assistant','Patient Coordinator',
    'Chief Executive Officer','Deputy Chief Executive Officer','Chief Operations Officer',
    'Medical Director','Director of Nursing','Consultant','Registrar (ST4-ST9)',
    'Charge Nurse','Staff Nurse',
    'PHEM Consultant','PHEM Doctor','Critical Care Paramedic','Advanced Paramedic',
    'Paramedic','Emergency Medical Technician','Emergency Care Assistant','Dispatcher',
    'Clinical Team Leader','Operations Manager'
  ));

alter table public.profiles
  add constraint profiles_roles_allowed check (
    cardinality(roles) >= 1 and roles <@ array[
      'GP Partner','Practice Manager','Assistant Manager','General Practitioner',
      'GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse',
      'Advanced Clinical Practitioner','General Practice Nurse','Nurse Associate',
      'Healthcare Assistant','Patient Coordinator',
      'Chief Executive Officer','Deputy Chief Executive Officer','Chief Operations Officer',
      'Medical Director','Director of Nursing','Consultant','Registrar (ST4-ST9)',
      'Charge Nurse','Staff Nurse',
      'PHEM Consultant','PHEM Doctor','Critical Care Paramedic','Advanced Paramedic',
      'Paramedic','Emergency Medical Technician','Emergency Care Assistant','Dispatcher',
      'Clinical Team Leader','Operations Manager'
    ]::text[] and role = any(roles)
  );

-- ---------------------------------------------------------------------------
-- Shared Care organisation links
-- ---------------------------------------------------------------------------

create table if not exists public.recordsweb_shared_care_links (
  id uuid primary key default gen_random_uuid(),
  organisation_a_id uuid not null references public.organisations(id) on delete cascade,
  organisation_b_id uuid not null references public.organisations(id) on delete cascade,
  requested_by_organisation_id uuid not null references public.organisations(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','active','suspended','declined','revoked')),
  permissions_a_to_b jsonb not null default '{
    "problems": true,
    "medications": true,
    "consultations": true,
    "investigations": true,
    "documents": true,
    "referrals": true,
    "care_history": true,
    "alerts": true
  }'::jsonb,
  permissions_b_to_a jsonb not null default '{
    "problems": true,
    "medications": true,
    "consultations": true,
    "investigations": true,
    "documents": true,
    "referrals": true,
    "care_history": true,
    "alerts": true
  }'::jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (organisation_a_id <> organisation_b_id),
  check (requested_by_organisation_id in (organisation_a_id, organisation_b_id))
);

create unique index if not exists recordsweb_shared_care_links_pair_unique_idx
  on public.recordsweb_shared_care_links (
    least(organisation_a_id, organisation_b_id),
    greatest(organisation_a_id, organisation_b_id)
  );

create index if not exists recordsweb_shared_care_links_a_idx
  on public.recordsweb_shared_care_links(organisation_a_id, status);
create index if not exists recordsweb_shared_care_links_b_idx
  on public.recordsweb_shared_care_links(organisation_b_id, status);

create table if not exists public.recordsweb_shared_patient_links (
  id uuid primary key default gen_random_uuid(),
  shared_care_link_id uuid not null references public.recordsweb_shared_care_links(id) on delete cascade,
  patient_a_id uuid not null references public.patients(id) on delete cascade,
  patient_b_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  linked_by uuid references public.profiles(id) on delete set null default auth.uid(),
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(shared_care_link_id, patient_a_id, patient_b_id)
);

create index if not exists recordsweb_shared_patient_links_a_idx
  on public.recordsweb_shared_patient_links(patient_a_id, status);
create index if not exists recordsweb_shared_patient_links_b_idx
  on public.recordsweb_shared_patient_links(patient_b_id, status);

alter table public.recordsweb_shared_care_links enable row level security;
alter table public.recordsweb_shared_patient_links enable row level security;

revoke all on public.recordsweb_shared_care_links from anon, authenticated;
revoke all on public.recordsweb_shared_patient_links from anon, authenticated;

grant select on public.recordsweb_shared_care_links to authenticated;
grant select on public.recordsweb_shared_patient_links to authenticated;

drop policy if exists "shared_care_link_participant_read" on public.recordsweb_shared_care_links;
create policy "shared_care_link_participant_read"
on public.recordsweb_shared_care_links for select to authenticated
using (
  public.current_organisation_id() in (organisation_a_id, organisation_b_id)
);

drop policy if exists "shared_patient_link_participant_read" on public.recordsweb_shared_patient_links;
create policy "shared_patient_link_participant_read"
on public.recordsweb_shared_patient_links for select to authenticated
using (
  exists (
    select 1
    from public.recordsweb_shared_care_links l
    where l.id = shared_care_link_id
      and public.current_organisation_id() in (l.organisation_a_id, l.organisation_b_id)
  )
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.recordsweb_shared_care_clean_permissions(p_permissions jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'problems', coalesce((p_permissions ->> 'problems')::boolean, true),
    'medications', coalesce((p_permissions ->> 'medications')::boolean, true),
    'consultations', coalesce((p_permissions ->> 'consultations')::boolean, true),
    'investigations', coalesce((p_permissions ->> 'investigations')::boolean, true),
    'documents', coalesce((p_permissions ->> 'documents')::boolean, true),
    'referrals', coalesce((p_permissions ->> 'referrals')::boolean, true),
    'care_history', coalesce((p_permissions ->> 'care_history')::boolean, true),
    'alerts', coalesce((p_permissions ->> 'alerts')::boolean, true)
  )
$$;

create or replace function public.recordsweb_shared_care_write_audit(
  p_action text,
  p_entity_id uuid,
  p_patient_id uuid,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log(
    organisation_id, actor_id, patient_id, action, entity_type, entity_id, description, metadata
  ) values (
    public.current_organisation_id(), auth.uid(), p_patient_id, p_action,
    'shared_care', p_entity_id, p_description, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.recordsweb_shared_care_write_audit(text,uuid,uuid,text,jsonb) from public;

-- ---------------------------------------------------------------------------
-- Management RPCs
-- ---------------------------------------------------------------------------

create or replace function public.recordsweb_shared_care_get_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_code text;
begin
  if v_org is null or not public.current_user_is_management() then
    raise exception 'Management permission is required.' using errcode = '42501';
  end if;

  select shared_care_code into v_code from public.organisations where id = v_org;
  if v_code is null then
    v_code := public.recordsweb_generate_shared_care_code();
    update public.organisations set shared_care_code = v_code where id = v_org;
  end if;

  return v_code;
end;
$$;

create or replace function public.recordsweb_shared_care_list_links()
returns table (
  link_id uuid,
  status text,
  partner_organisation_id uuid,
  partner_code text,
  partner_name text,
  partner_mode text,
  requested_by_us boolean,
  created_at timestamptz,
  approved_at timestamptz,
  updated_at timestamptz,
  outbound_permissions jsonb,
  inbound_permissions jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.current_organisation_id() as id)
  select
    l.id,
    l.status,
    case when l.organisation_a_id = me.id then l.organisation_b_id else l.organisation_a_id end,
    other.org_code,
    other.name,
    other.system_mode,
    l.requested_by_organisation_id = me.id,
    l.created_at,
    l.approved_at,
    l.updated_at,
    case when l.organisation_a_id = me.id then l.permissions_a_to_b else l.permissions_b_to_a end,
    case when l.organisation_a_id = me.id then l.permissions_b_to_a else l.permissions_a_to_b end
  from public.recordsweb_shared_care_links l
  cross join me
  join public.organisations other
    on other.id = case when l.organisation_a_id = me.id then l.organisation_b_id else l.organisation_a_id end
  where me.id is not null
    and public.current_user_is_management()
    and me.id in (l.organisation_a_id, l.organisation_b_id)
  order by
    case l.status when 'pending' then 0 when 'active' then 1 when 'suspended' then 2 else 3 end,
    other.name
$$;

create or replace function public.recordsweb_shared_care_request(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_target uuid;
  v_link public.recordsweb_shared_care_links%rowtype;
  v_code text := upper(regexp_replace(trim(coalesce(p_code,'')), '[^A-Z0-9]', '', 'g'));
begin
  if v_org is null or not public.current_user_is_management() then
    raise exception 'Management permission is required.' using errcode = '42501';
  end if;
  if not public.recordsweb_billing_write_allowed() then raise exception 'RecordsWeb is read-only until billing is restored.' using errcode='42501'; end if;
  if length(v_code) <> 6 then
    raise exception 'Enter a valid six-character Shared Care code.';
  end if;

  select id into v_target
  from public.organisations
  where shared_care_code = v_code and active = true;

  if v_target is null then raise exception 'No active RecordsWeb community was found for that Shared Care code.'; end if;
  if v_target = v_org then raise exception 'A community cannot link Shared Care to itself.'; end if;

  select * into v_link
  from public.recordsweb_shared_care_links
  where least(organisation_a_id, organisation_b_id) = least(v_org, v_target)
    and greatest(organisation_a_id, organisation_b_id) = greatest(v_org, v_target)
  limit 1;

  if v_link.id is not null and v_link.status in ('pending','active','suspended') then
    raise exception 'A Shared Care relationship with this community already exists.';
  end if;

  if v_link.id is null then
    insert into public.recordsweb_shared_care_links(
      organisation_a_id, organisation_b_id, requested_by_organisation_id, status
    ) values (v_org, v_target, v_org, 'pending')
    returning * into v_link;
  else
    update public.recordsweb_shared_care_links
    set requested_by_organisation_id = v_org,
        status = 'pending', approved_at = null, updated_at = now()
    where id = v_link.id
    returning * into v_link;
  end if;

  perform public.recordsweb_shared_care_write_audit(
    'shared_care.requested', v_link.id, null,
    'Requested a Shared Care relationship with another RecordsWeb community.',
    jsonb_build_object('partner_organisation_id', v_target)
  );

  return v_link.id;
end;
$$;

create or replace function public.recordsweb_shared_care_respond(p_link_id uuid, p_decision text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_link public.recordsweb_shared_care_links%rowtype;
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_status text;
begin
  if v_org is null or not public.current_user_is_management() then
    raise exception 'Management permission is required.' using errcode = '42501';
  end if;
  if not public.recordsweb_billing_write_allowed() then raise exception 'RecordsWeb is read-only until billing is restored.' using errcode='42501'; end if;
  if v_decision not in ('approve','decline') then raise exception 'Decision must be approve or decline.'; end if;

  select * into v_link from public.recordsweb_shared_care_links where id = p_link_id;
  if v_link.id is null or v_org not in (v_link.organisation_a_id, v_link.organisation_b_id) then
    raise exception 'Shared Care request not found.';
  end if;
  if v_link.status <> 'pending' then raise exception 'This Shared Care request is no longer pending.'; end if;
  if v_link.requested_by_organisation_id = v_org then raise exception 'The requesting community cannot approve its own request.'; end if;

  v_status := case when v_decision = 'approve' then 'active' else 'declined' end;
  update public.recordsweb_shared_care_links
  set status = v_status,
      approved_at = case when v_status = 'active' then now() else null end,
      updated_at = now()
  where id = p_link_id;

  perform public.recordsweb_shared_care_write_audit(
    case when v_status='active' then 'shared_care.approved' else 'shared_care.declined' end,
    p_link_id, null,
    case when v_status='active' then 'Approved a Shared Care relationship.' else 'Declined a Shared Care relationship.' end
  );

  return v_status;
end;
$$;

create or replace function public.recordsweb_shared_care_set_status(p_link_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_link public.recordsweb_shared_care_links%rowtype;
  v_status text := lower(trim(coalesce(p_status,'')));
begin
  if v_org is null or not public.current_user_is_management() then
    raise exception 'Management permission is required.' using errcode = '42501';
  end if;
  if not public.recordsweb_billing_write_allowed() then raise exception 'RecordsWeb is read-only until billing is restored.' using errcode='42501'; end if;
  if v_status not in ('active','suspended','revoked') then raise exception 'Invalid Shared Care status.'; end if;

  select * into v_link from public.recordsweb_shared_care_links where id = p_link_id;
  if v_link.id is null or v_org not in (v_link.organisation_a_id, v_link.organisation_b_id) then
    raise exception 'Shared Care relationship not found.';
  end if;
  if v_status = 'active' and v_link.status <> 'suspended' then
    raise exception 'Only a suspended Shared Care relationship can be resumed.';
  end if;
  if v_status in ('suspended','revoked') and v_link.status <> 'active' then
    raise exception 'Only an active Shared Care relationship can be suspended or revoked.';
  end if;

  update public.recordsweb_shared_care_links
  set status = v_status,
      approved_at = case when v_status='active' then coalesce(approved_at, now()) else approved_at end,
      updated_at = now()
  where id = p_link_id;

  if v_status = 'revoked' then
    update public.recordsweb_shared_patient_links
    set status = 'revoked', updated_at = now()
    where shared_care_link_id = p_link_id and status = 'active';
  end if;

  perform public.recordsweb_shared_care_write_audit(
    'shared_care.' || v_status, p_link_id, null,
    'Changed the Shared Care relationship status to ' || v_status || '.'
  );

  return v_status;
end;
$$;

create or replace function public.recordsweb_shared_care_update_permissions(p_link_id uuid, p_permissions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_link public.recordsweb_shared_care_links%rowtype;
  v_permissions jsonb := public.recordsweb_shared_care_clean_permissions(coalesce(p_permissions,'{}'::jsonb));
begin
  if v_org is null or not public.current_user_is_management() then
    raise exception 'Management permission is required.' using errcode = '42501';
  end if;
  if not public.recordsweb_billing_write_allowed() then raise exception 'RecordsWeb is read-only until billing is restored.' using errcode='42501'; end if;

  select * into v_link from public.recordsweb_shared_care_links where id = p_link_id;
  if v_link.id is null or v_org not in (v_link.organisation_a_id, v_link.organisation_b_id) then
    raise exception 'Shared Care relationship not found.';
  end if;

  if v_link.organisation_a_id = v_org then
    update public.recordsweb_shared_care_links
    set permissions_a_to_b = v_permissions, updated_at = now()
    where id = p_link_id;
  else
    update public.recordsweb_shared_care_links
    set permissions_b_to_a = v_permissions, updated_at = now()
    where id = p_link_id;
  end if;

  perform public.recordsweb_shared_care_write_audit(
    'shared_care.permissions.updated', p_link_id, null,
    'Updated outbound Shared Care permissions.',
    jsonb_build_object('permissions', v_permissions)
  );

  return v_permissions;
end;
$$;

-- ---------------------------------------------------------------------------
-- Patient matching/linking RPCs
-- ---------------------------------------------------------------------------

create or replace function public.recordsweb_shared_care_patient_candidates(p_patient_id uuid)
returns table (
  shared_care_link_id uuid,
  partner_organisation_id uuid,
  partner_code text,
  partner_name text,
  partner_mode text,
  remote_patient_id uuid,
  remote_first_name text,
  remote_last_name text,
  remote_dob date,
  remote_nhs_number text,
  match_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.*, public.current_organisation_id() as current_org
    from public.patients p
    where p.id = p_patient_id
      and p.organisation_id = public.current_organisation_id()
  ), active_links as (
    select l.*,
      case when l.organisation_a_id = me.current_org then l.organisation_b_id else l.organisation_a_id end as partner_org
    from public.recordsweb_shared_care_links l
    cross join me
    where l.status = 'active'
      and me.current_org in (l.organisation_a_id, l.organisation_b_id)
  ), local_rbx as (
    select r.roblox_user_id
    from public.recordsweb_roblox_patient_identities r
    join me on me.id = r.patient_id
    where r.organisation_id = me.current_org
    limit 1
  )
  select distinct on (l.id, rp.id)
    l.id,
    o.id,
    o.org_code,
    o.name,
    o.system_mode,
    rp.id,
    rp.first_name,
    rp.last_name,
    rp.dob,
    rp.nhs_number,
    case
      when rr.roblox_user_id is not null and rr.roblox_user_id = lr.roblox_user_id then 'Roblox identity'
      when regexp_replace(coalesce(rp.nhs_number,''),'\s','','g') <> ''
       and regexp_replace(coalesce(rp.nhs_number,''),'\s','','g') = regexp_replace(coalesce(me.nhs_number,''),'\s','','g') then 'NHS number'
      else 'Name and date of birth'
    end as match_reason
  from active_links l
  join public.organisations o on o.id = l.partner_org
  join public.patients rp on rp.organisation_id = l.partner_org
  cross join me
  left join local_rbx lr on true
  left join public.recordsweb_roblox_patient_identities rr
    on rr.patient_id = rp.id and rr.organisation_id = rp.organisation_id
  where not exists (
    select 1 from public.recordsweb_shared_patient_links spl
    where spl.shared_care_link_id = l.id
      and spl.status = 'active'
      and (spl.patient_a_id = me.id or spl.patient_b_id = me.id)
  )
  and (
    (lr.roblox_user_id is not null and rr.roblox_user_id = lr.roblox_user_id)
    or (
      regexp_replace(coalesce(me.nhs_number,''),'\s','','g') <> ''
      and regexp_replace(coalesce(rp.nhs_number,''),'\s','','g') = regexp_replace(coalesce(me.nhs_number,''),'\s','','g')
    )
    or (
      lower(trim(rp.first_name)) = lower(trim(me.first_name))
      and lower(trim(rp.last_name)) = lower(trim(me.last_name))
      and rp.dob = me.dob
    )
  )
  order by l.id, rp.id,
    case
      when rr.roblox_user_id is not null and rr.roblox_user_id = lr.roblox_user_id then 1
      when regexp_replace(coalesce(rp.nhs_number,''),'\s','','g') = regexp_replace(coalesce(me.nhs_number,''),'\s','','g') then 2
      else 3
    end
$$;

create or replace function public.recordsweb_shared_care_link_patient(
  p_shared_care_link_id uuid,
  p_local_patient_id uuid,
  p_remote_patient_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_link public.recordsweb_shared_care_links%rowtype;
  v_local public.patients%rowtype;
  v_remote public.patients%rowtype;
  v_patient_a uuid;
  v_patient_b uuid;
  v_id uuid;
  v_match boolean := false;
begin
  if v_org is null then raise exception 'Unable to determine the current RecordsWeb community.' using errcode = '42501'; end if;
  if not public.recordsweb_billing_write_allowed() then raise exception 'RecordsWeb is read-only until billing is restored.' using errcode='42501'; end if;

  select * into v_link from public.recordsweb_shared_care_links
  where id = p_shared_care_link_id and status = 'active';
  if v_link.id is null or v_org not in (v_link.organisation_a_id, v_link.organisation_b_id) then
    raise exception 'An active Shared Care relationship is required.';
  end if;

  select * into v_local from public.patients where id = p_local_patient_id and organisation_id = v_org;
  if v_local.id is null then raise exception 'Local patient record not found.'; end if;

  select * into v_remote from public.patients where id = p_remote_patient_id;
  if v_remote.id is null then raise exception 'Partner patient record not found.'; end if;

  if v_link.organisation_a_id = v_org then
    if v_remote.organisation_id <> v_link.organisation_b_id then raise exception 'Partner patient does not belong to this Shared Care community.'; end if;
    v_patient_a := v_local.id; v_patient_b := v_remote.id;
  else
    if v_remote.organisation_id <> v_link.organisation_a_id then raise exception 'Partner patient does not belong to this Shared Care community.'; end if;
    v_patient_a := v_remote.id; v_patient_b := v_local.id;
  end if;

  if exists (
    select 1 from public.recordsweb_shared_patient_links spl
    where spl.shared_care_link_id = v_link.id
      and spl.status = 'active'
      and (spl.patient_a_id = v_local.id or spl.patient_b_id = v_local.id)
  ) then
    raise exception 'This local patient is already linked to a patient in that Shared Care community.';
  end if;

  -- Never allow a caller to link an arbitrary patient UUID. The remote record
  -- must match the local patient by a persistent Roblox identity, NHS number,
  -- or exact name + DOB. Staff still confirm the suggested match in the UI.
  select (
    exists (
      select 1
      from public.recordsweb_roblox_patient_identities li
      join public.recordsweb_roblox_patient_identities ri
        on ri.roblox_user_id = li.roblox_user_id
      where li.patient_id = v_local.id
        and li.organisation_id = v_local.organisation_id
        and ri.patient_id = v_remote.id
        and ri.organisation_id = v_remote.organisation_id
    )
    or (
      regexp_replace(coalesce(v_local.nhs_number,''),'\s','','g') <> ''
      and regexp_replace(coalesce(v_local.nhs_number,''),'\s','','g') = regexp_replace(coalesce(v_remote.nhs_number,''),'\s','','g')
    )
    or (
      lower(trim(v_local.first_name)) = lower(trim(v_remote.first_name))
      and lower(trim(v_local.last_name)) = lower(trim(v_remote.last_name))
      and v_local.dob = v_remote.dob
    )
  ) into v_match;

  if not coalesce(v_match, false) then
    raise exception 'The selected partner patient does not match this local patient strongly enough for Shared Care linking.';
  end if;

  select id into v_id
  from public.recordsweb_shared_patient_links
  where shared_care_link_id = v_link.id
    and patient_a_id = v_patient_a
    and patient_b_id = v_patient_b
  limit 1;

  if v_id is null then
    insert into public.recordsweb_shared_patient_links(
      shared_care_link_id, patient_a_id, patient_b_id, linked_by
    ) values (v_link.id, v_patient_a, v_patient_b, auth.uid())
    returning id into v_id;
  else
    update public.recordsweb_shared_patient_links
    set status='active', linked_by=auth.uid(), linked_at=now(), updated_at=now()
    where id=v_id;
  end if;

  perform public.recordsweb_shared_care_write_audit(
    'shared_care.patient.linked', v_id, v_local.id,
    'Linked this patient to a partner Shared Care patient record.',
    jsonb_build_object('partner_patient_id', v_remote.id, 'shared_care_link_id', v_link.id)
  );

  return v_id;
end;
$$;

create or replace function public.recordsweb_shared_care_unlink_patient(p_shared_patient_link_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_row public.recordsweb_shared_patient_links%rowtype;
  v_link public.recordsweb_shared_care_links%rowtype;
  v_local_patient uuid;
begin
  if not public.recordsweb_billing_write_allowed() then raise exception 'RecordsWeb is read-only until billing is restored.' using errcode='42501'; end if;
  select * into v_row from public.recordsweb_shared_patient_links where id = p_shared_patient_link_id and status='active';
  if v_row.id is null then raise exception 'Shared patient link not found.'; end if;
  select * into v_link from public.recordsweb_shared_care_links where id = v_row.shared_care_link_id;
  if v_org not in (v_link.organisation_a_id, v_link.organisation_b_id) then raise exception 'Shared patient link not found.'; end if;

  v_local_patient := case when v_link.organisation_a_id = v_org then v_row.patient_a_id else v_row.patient_b_id end;

  update public.recordsweb_shared_patient_links
  set status='revoked', updated_at=now()
  where id=p_shared_patient_link_id;

  perform public.recordsweb_shared_care_write_audit(
    'shared_care.patient.unlinked', p_shared_patient_link_id, v_local_patient,
    'Removed the patient Shared Care link.'
  );

  return true;
end;
$$;

create or replace function public.recordsweb_shared_care_list_patient_links(p_patient_id uuid)
returns table (
  shared_patient_link_id uuid,
  shared_care_link_id uuid,
  partner_organisation_id uuid,
  partner_code text,
  partner_name text,
  partner_mode text,
  remote_patient_id uuid,
  remote_first_name text,
  remote_last_name text,
  remote_dob date,
  remote_nhs_number text,
  outbound_permissions jsonb,
  inbound_permissions jsonb,
  linked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select public.current_organisation_id() as org_id
  )
  select
    spl.id,
    l.id,
    partner.id,
    partner.org_code,
    partner.name,
    partner.system_mode,
    remote.id,
    remote.first_name,
    remote.last_name,
    remote.dob,
    remote.nhs_number,
    case when l.organisation_a_id = me.org_id then l.permissions_a_to_b else l.permissions_b_to_a end,
    case when l.organisation_a_id = me.org_id then l.permissions_b_to_a else l.permissions_a_to_b end,
    spl.linked_at
  from public.recordsweb_shared_patient_links spl
  join public.recordsweb_shared_care_links l on l.id = spl.shared_care_link_id and l.status='active'
  cross join me
  join public.organisations partner
    on partner.id = case when l.organisation_a_id = me.org_id then l.organisation_b_id else l.organisation_a_id end
  join public.patients remote
    on remote.id = case when l.organisation_a_id = me.org_id then spl.patient_b_id else spl.patient_a_id end
  where spl.status='active'
    and me.org_id in (l.organisation_a_id, l.organisation_b_id)
    and p_patient_id = case when l.organisation_a_id = me.org_id then spl.patient_a_id else spl.patient_b_id end
  order by partner.name
$$;

-- ---------------------------------------------------------------------------
-- Secure cross-community clinical snapshot
-- ---------------------------------------------------------------------------

create or replace function public.recordsweb_shared_care_patient_snapshot(p_shared_patient_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_patient_link public.recordsweb_shared_patient_links%rowtype;
  v_link public.recordsweb_shared_care_links%rowtype;
  v_local_patient uuid;
  v_remote_patient uuid;
  v_remote_org uuid;
  v_permissions jsonb;
  v_result jsonb;
begin
  if v_org is null then raise exception 'Unable to determine the current RecordsWeb community.' using errcode='42501'; end if;

  select * into v_patient_link
  from public.recordsweb_shared_patient_links
  where id = p_shared_patient_link_id and status='active';
  if v_patient_link.id is null then raise exception 'Shared patient record not found.'; end if;

  select * into v_link
  from public.recordsweb_shared_care_links
  where id = v_patient_link.shared_care_link_id and status='active';
  if v_link.id is null or v_org not in (v_link.organisation_a_id, v_link.organisation_b_id) then
    raise exception 'An active Shared Care relationship is required.' using errcode='42501';
  end if;

  if v_link.organisation_a_id = v_org then
    v_local_patient := v_patient_link.patient_a_id;
    v_remote_patient := v_patient_link.patient_b_id;
    v_remote_org := v_link.organisation_b_id;
    v_permissions := v_link.permissions_b_to_a;
  else
    v_local_patient := v_patient_link.patient_b_id;
    v_remote_patient := v_patient_link.patient_a_id;
    v_remote_org := v_link.organisation_a_id;
    v_permissions := v_link.permissions_a_to_b;
  end if;

  select jsonb_build_object(
    'sourceOrganisation', jsonb_build_object(
      'id', o.id,
      'code', o.org_code,
      'name', o.name,
      'mode', o.system_mode
    ),
    'patient', jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'firstName', p.first_name,
      'lastName', p.last_name,
      'dob', p.dob,
      'sex', p.sex,
      'gender', p.gender,
      'nhsNumber', p.nhs_number,
      'recordNumber', p.emis_number,
      'usualGp', p.usual_gp,
      'status', p.status
    ),
    'permissions', v_permissions,
    'problems', case when coalesce((v_permissions->>'problems')::boolean,false)
      then coalesce((select jsonb_agg(to_jsonb(x) - 'patient_id' order by x.onset_date desc nulls last, x.created_at desc) from public.problems x where x.patient_id=v_remote_patient),'[]'::jsonb)
      else null end,
    'medications', case when coalesce((v_permissions->>'medications')::boolean,false)
      then coalesce((select jsonb_agg(to_jsonb(x) - 'patient_id' order by x.last_issue_date desc nulls last, x.created_at desc) from public.medications x where x.patient_id=v_remote_patient),'[]'::jsonb)
      else null end,
    'consultations', case when coalesce((v_permissions->>'consultations')::boolean,false)
      then coalesce((select jsonb_agg(to_jsonb(x) - 'patient_id' order by x.date desc) from public.consultations x where x.patient_id=v_remote_patient),'[]'::jsonb)
      else null end,
    'investigations', case when coalesce((v_permissions->>'investigations')::boolean,false)
      then coalesce((select jsonb_agg(to_jsonb(x) - 'patient_id' order by x.date desc nulls last, x.created_at desc) from public.investigations x where x.patient_id=v_remote_patient),'[]'::jsonb)
      else null end,
    'documents', case when coalesce((v_permissions->>'documents')::boolean,false)
      then coalesce((select jsonb_agg((to_jsonb(x) - 'patient_id' - 'storage_path') order by x.date desc nulls last, x.created_at desc) from public.documents x where x.patient_id=v_remote_patient),'[]'::jsonb)
      else null end,
    'referrals', case when coalesce((v_permissions->>'referrals')::boolean,false)
      then coalesce((select jsonb_agg(to_jsonb(x) - 'patient_id' order by x.created_at desc) from public.referrals x where x.patient_id=v_remote_patient),'[]'::jsonb)
      else null end,
    'careHistory', case when coalesce((v_permissions->>'care_history')::boolean,false)
      then coalesce((select jsonb_agg((to_jsonb(x) - 'patient_id' - 'organisation_id') order by x.created_at desc) from public.patient_record_events x where x.patient_id=v_remote_patient),'[]'::jsonb)
      else null end,
    'alerts', case when coalesce((v_permissions->>'alerts')::boolean,false)
      then coalesce((select jsonb_agg(to_jsonb(x) - 'patient_id' order by x.created_at desc) from public.patient_alerts x where x.patient_id=v_remote_patient and coalesce(x.active,true)=true),'[]'::jsonb)
      else null end,
    'generatedAt', now()
  ) into v_result
  from public.patients p
  join public.organisations o on o.id = v_remote_org
  where p.id = v_remote_patient and p.organisation_id = v_remote_org;

  if v_result is null then raise exception 'Partner patient record could not be loaded.'; end if;

  perform public.recordsweb_shared_care_write_audit(
    'shared_care.patient.viewed', p_shared_patient_link_id, v_local_patient,
    'Viewed a partner community patient record through Shared Care.',
    jsonb_build_object('source_organisation_id', v_remote_org, 'source_patient_id', v_remote_patient)
  );

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.recordsweb_generate_shared_care_code() from public;
grant execute on function public.recordsweb_generate_shared_care_code() to service_role;
revoke all on function public.recordsweb_protect_shared_care_code() from public;
revoke all on function public.recordsweb_shared_care_clean_permissions(jsonb) from public;

revoke all on function public.recordsweb_shared_care_get_code() from public;
revoke all on function public.recordsweb_shared_care_list_links() from public;
revoke all on function public.recordsweb_shared_care_request(text) from public;
revoke all on function public.recordsweb_shared_care_respond(uuid,text) from public;
revoke all on function public.recordsweb_shared_care_set_status(uuid,text) from public;
revoke all on function public.recordsweb_shared_care_update_permissions(uuid,jsonb) from public;
revoke all on function public.recordsweb_shared_care_patient_candidates(uuid) from public;
revoke all on function public.recordsweb_shared_care_link_patient(uuid,uuid,uuid) from public;
revoke all on function public.recordsweb_shared_care_unlink_patient(uuid) from public;
revoke all on function public.recordsweb_shared_care_list_patient_links(uuid) from public;
revoke all on function public.recordsweb_shared_care_patient_snapshot(uuid) from public;

grant execute on function public.recordsweb_shared_care_get_code() to authenticated;
grant execute on function public.recordsweb_shared_care_list_links() to authenticated;
grant execute on function public.recordsweb_shared_care_request(text) to authenticated;
grant execute on function public.recordsweb_shared_care_respond(uuid,text) to authenticated;
grant execute on function public.recordsweb_shared_care_set_status(uuid,text) to authenticated;
grant execute on function public.recordsweb_shared_care_update_permissions(uuid,jsonb) to authenticated;
grant execute on function public.recordsweb_shared_care_patient_candidates(uuid) to authenticated;
grant execute on function public.recordsweb_shared_care_link_patient(uuid,uuid,uuid) to authenticated;
grant execute on function public.recordsweb_shared_care_unlink_patient(uuid) to authenticated;
grant execute on function public.recordsweb_shared_care_list_patient_links(uuid) to authenticated;
grant execute on function public.recordsweb_shared_care_patient_snapshot(uuid) to authenticated;


-- Public access requests can now request Ambulance / PHEM mode as well.
alter table if exists public.recordsweb_access_requests
  drop constraint if exists recordsweb_access_requests_mode;

alter table if exists public.recordsweb_access_requests
  add constraint recordsweb_access_requests_mode
  check (requested_mode in ('general_practice','hospital','ambulance'));

create or replace function public.recordsweb_submit_access_request(
  p_request_id uuid,
  p_community_name text,
  p_requested_mode text,
  p_discord_url text,
  p_roblox_group_url text,
  p_member_range text,
  p_contact_name text,
  p_contact_email text,
  p_discord_username text default null,
  p_logo_path text default null,
  p_additional_details text default null,
  p_authorised_contact boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_mode text := lower(trim(coalesce(p_requested_mode,'')));
  v_members text := trim(coalesce(p_member_range,''));
  v_email text := lower(trim(coalesce(p_contact_email,'')));
begin
  if char_length(trim(coalesce(p_community_name,''))) not between 2 and 120 then raise exception 'Community name is required.'; end if;
  if char_length(trim(coalesce(p_contact_name,''))) not between 2 and 120 then raise exception 'Contact name is required.'; end if;
  if v_mode not in ('general_practice','hospital','ambulance') then raise exception 'Invalid RecordsWeb mode.'; end if;
  if v_members not in ('10-99','100-999','1000-9999','10000+') then raise exception 'Invalid community size.'; end if;
  if p_authorised_contact is not true then raise exception 'Authorisation confirmation is required.'; end if;
  if trim(coalesce(p_discord_url,'')) !~* '^https://' then raise exception 'Discord URL must use HTTPS.'; end if;
  if trim(coalesce(p_roblox_group_url,'')) !~* '^https://' then raise exception 'Roblox group URL must use HTTPS.'; end if;
  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid contact email.'; end if;
  if p_logo_path is null or p_logo_path not like ('requests/' || v_id::text || '/%') then raise exception 'A valid request logo upload is required.'; end if;

  insert into public.recordsweb_access_requests (
    id, community_name, requested_mode, discord_url, roblox_group_url, member_range,
    contact_name, contact_email, discord_username, logo_path, additional_details,
    authorised_contact, status
  ) values (
    v_id, trim(p_community_name), v_mode, trim(p_discord_url), trim(p_roblox_group_url), v_members,
    trim(p_contact_name), v_email, nullif(trim(coalesce(p_discord_username,'')),''), p_logo_path,
    nullif(trim(coalesce(p_additional_details,'')),''), true, 'pending'
  );

  return v_id;
end;
$$;

revoke all on function public.recordsweb_submit_access_request(uuid,text,text,text,text,text,text,text,text,text,text,boolean) from public;
grant execute on function public.recordsweb_submit_access_request(uuid,text,text,text,text,text,text,text,text,text,text,boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- v3.3.9 — Deployment request email automation tracking
-- ---------------------------------------------------------------------------

alter table public.recordsweb_access_requests
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists approved_email_sent_at timestamptz,
  add column if not exists declined_email_sent_at timestamptz;

comment on column public.recordsweb_access_requests.confirmation_email_sent_at is
  'When the automatic RecordsWeb deployment-request received email was successfully sent.';

comment on column public.recordsweb_access_requests.approved_email_sent_at is
  'When the automatic RecordsWeb deployment-request approval email was successfully sent.';

comment on column public.recordsweb_access_requests.declined_email_sent_at is
  'When the automatic RecordsWeb deployment-request decline email was successfully sent.';

-- ---------------------------------------------------------------------------
-- v3.3.9 — Provider comments + reliable decision-email review support
-- ---------------------------------------------------------------------------

-- RecordsWeb 3.3.9 — provider comments + decision email review support
-- Website-only patch. Safe to run on an existing v3.3.9 database.

alter table public.recordsweb_access_requests
  add column if not exists provider_comments text,
  add column if not exists approved_email_sent_at timestamptz,
  add column if not exists declined_email_sent_at timestamptz;

comment on column public.recordsweb_access_requests.provider_comments is
  'Public-facing comments from the RecordsWeb provider/reviewer. Included in approval or decline emails when present.';

comment on column public.recordsweb_access_requests.approved_email_sent_at is
  'When the automatic deployment-request approval email was successfully sent.';

comment on column public.recordsweb_access_requests.declined_email_sent_at is
  'When the automatic deployment-request decline email was successfully sent.';

-- The row shape changed, so PostgreSQL requires the existing table-returning
-- function to be dropped before it can be recreated with provider_comments.
drop function if exists public.recordsweb_list_access_requests(text);

create function public.recordsweb_list_access_requests(p_status text default null)
returns table (
  id uuid,
  community_name text,
  requested_mode text,
  discord_url text,
  roblox_group_url text,
  member_range text,
  contact_name text,
  contact_email text,
  discord_username text,
  logo_path text,
  additional_details text,
  authorised_contact boolean,
  status text,
  operator_notes text,
  provider_comments text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
begin
  if not public.recordsweb_is_access_request_reviewer() then
    raise exception 'Access denied: this account is not authorised to review RecordsWeb access requests.' using errcode = '42501';
  end if;

  if v_status is not null and v_status not in ('pending','reviewing','approved','declined') then
    raise exception 'Invalid request status.';
  end if;

  return query
  select
    r.id,
    r.community_name,
    r.requested_mode,
    r.discord_url,
    r.roblox_group_url,
    r.member_range,
    r.contact_name,
    r.contact_email,
    r.discord_username,
    r.logo_path,
    r.additional_details,
    r.authorised_contact,
    r.status,
    r.operator_notes,
    r.provider_comments,
    r.reviewed_at,
    r.reviewed_by,
    r.created_at,
    r.updated_at
  from public.recordsweb_access_requests r
  where v_status is null or r.status = v_status
  order by
    case r.status when 'pending' then 0 when 'reviewing' then 1 when 'approved' then 2 else 3 end,
    r.created_at desc;
end;
$$;

revoke all on function public.recordsweb_list_access_requests(text) from public;
grant execute on function public.recordsweb_list_access_requests(text) to authenticated;

-- Replace the old 3-argument review RPC with a backwards-compatible 4-argument
-- version. p_provider_comments defaults to null, so older callers remain valid.
drop function if exists public.recordsweb_review_access_request(uuid,text,text);
drop function if exists public.recordsweb_review_access_request(uuid,text,text,text);

create function public.recordsweb_review_access_request(
  p_request_id uuid,
  p_status text,
  p_operator_notes text default null,
  p_provider_comments text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_id uuid;
begin
  if not public.recordsweb_is_access_request_reviewer() then
    raise exception 'Access denied: this account is not authorised to review RecordsWeb access requests.' using errcode = '42501';
  end if;

  if v_status not in ('pending','reviewing','approved','declined') then
    raise exception 'Invalid request status.';
  end if;

  update public.recordsweb_access_requests
  set
    status = v_status,
    operator_notes = nullif(trim(coalesce(p_operator_notes, '')), ''),
    provider_comments = nullif(trim(coalesce(p_provider_comments, '')), ''),
    reviewed_at = case when v_status = 'pending' then null else now() end,
    reviewed_by = case when v_status = 'pending' then null else auth.uid() end,
    updated_at = now()
  where id = p_request_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Access request not found.';
  end if;

  return v_id;
end;
$$;

revoke all on function public.recordsweb_review_access_request(uuid,text,text,text) from public;
grant execute on function public.recordsweb_review_access_request(uuid,text,text,text) to authenticated;

commit;

-- ============================================================================
-- OPTIONAL CHECKS AFTER SUCCESS
-- ============================================================================

-- Every community should have a unique six-character Shared Care code:
-- select id, org_code, name, system_mode, shared_care_code
-- from public.organisations
-- order by name;

-- Check active Shared Care relationships:
-- select *
-- from public.recordsweb_shared_care_links
-- order by created_at desc;

-- Check the new problem end-date field:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'problems'
--   and column_name = 'end_date';

-- Check deployment-request email tracking:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'recordsweb_access_requests'
--   and column_name in ('confirmation_email_sent_at','approved_email_sent_at','declined_email_sent_at');

-- List Shared Care RPCs:
-- select routine_name
-- from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name like 'recordsweb_shared_care_%'
-- order by routine_name;


-- RecordsWeb 3.3.9 — decision amendment + denial email reliability patch
-- Website-only patch. Run once in Supabase SQL Editor.
--
-- Enables:
--   * Approved -> Denied -> Approved status changes
--   * An amended decision email every time the saved decision changes
--   * Retry of a decision email that failed to send
--   * Existing approved/denied rows are backfilled from the legacy email markers

begin;

alter table public.recordsweb_access_requests
  add column if not exists decision_revision integer not null default 0,
  add column if not exists decision_email_revision integer not null default 0,
  add column if not exists last_decision_email_status text,
  add column if not exists last_decision_email_sent_at timestamptz;

do $$ begin
  alter table public.recordsweb_access_requests
    add constraint recordsweb_access_requests_decision_revision_nonnegative
    check (decision_revision >= 0 and decision_email_revision >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.recordsweb_access_requests
    add constraint recordsweb_access_requests_last_decision_email_status_allowed
    check (last_decision_email_status is null or last_decision_email_status in ('approved','declined'));
exception when duplicate_object then null; end $$;

-- Give already-decided requests a revision of 1. Mark that revision as emailed
-- only where the corresponding historical timestamp proves a successful send.
update public.recordsweb_access_requests
set
  decision_revision = case
    when status in ('approved','declined') then greatest(decision_revision, 1)
    else decision_revision
  end,
  decision_email_revision = case
    when status = 'approved' and approved_email_sent_at is not null then greatest(decision_email_revision, 1)
    when status = 'declined' and declined_email_sent_at is not null then greatest(decision_email_revision, 1)
    else decision_email_revision
  end,
  last_decision_email_status = case
    when approved_email_sent_at is null and declined_email_sent_at is null then last_decision_email_status
    when coalesce(approved_email_sent_at, '-infinity'::timestamptz) >= coalesce(declined_email_sent_at, '-infinity'::timestamptz) then 'approved'
    else 'declined'
  end,
  last_decision_email_sent_at = greatest(approved_email_sent_at, declined_email_sent_at)
where status in ('approved','declined')
   or approved_email_sent_at is not null
   or declined_email_sent_at is not null;

-- PostgreSQL's greatest() returns null when all values are null; preserve any
-- pre-existing last sent timestamp if this patch is rerun.
update public.recordsweb_access_requests
set last_decision_email_sent_at = coalesce(
  last_decision_email_sent_at,
  approved_email_sent_at,
  declined_email_sent_at
)
where last_decision_email_sent_at is null;

-- Replace the review RPC so every *change into a decision state* creates a new
-- decision revision. Re-saving the same status does not create a new revision,
-- which allows the API to distinguish retry from amendment.
drop function if exists public.recordsweb_review_access_request(uuid,text,text,text);

create function public.recordsweb_review_access_request(
  p_request_id uuid,
  p_status text,
  p_operator_notes text default null,
  p_provider_comments text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_id uuid;
begin
  if not public.recordsweb_is_access_request_reviewer() then
    raise exception 'Access denied: this account is not authorised to review RecordsWeb access requests.' using errcode = '42501';
  end if;

  if v_status not in ('pending','reviewing','approved','declined') then
    raise exception 'Invalid request status.';
  end if;

  update public.recordsweb_access_requests r
  set
    status = v_status,
    operator_notes = nullif(trim(coalesce(p_operator_notes, '')), ''),
    provider_comments = nullif(trim(coalesce(p_provider_comments, '')), ''),
    reviewed_at = case when v_status = 'pending' then null else now() end,
    reviewed_by = case when v_status = 'pending' then null else auth.uid() end,
    decision_revision = case
      when v_status in ('approved','declined')
       and r.status is distinct from v_status
        then r.decision_revision + 1
      else r.decision_revision
    end,
    updated_at = now()
  where r.id = p_request_id
  returning r.id into v_id;

  if v_id is null then
    raise exception 'Access request not found.';
  end if;

  return v_id;
end;
$$;

revoke all on function public.recordsweb_review_access_request(uuid,text,text,text) from public;
grant execute on function public.recordsweb_review_access_request(uuid,text,text,text) to authenticated;

commit;

-- Optional verification:
-- select id, community_name, status, decision_revision, decision_email_revision,
--        last_decision_email_status, last_decision_email_sent_at,
--        approved_email_sent_at, declined_email_sent_at
-- from public.recordsweb_access_requests
-- order by created_at desc;
