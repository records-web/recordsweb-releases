-- RecordsWeb 4.0.0 — Security hardening, moderation and access controls
-- Apply after RecordsWeb 3.9.14.
--
-- Adds:
--   * append-only security event/audit stream
--   * session registry + revocation
--   * login-attempt telemetry / rate-limit support
--   * patient record access trail
--   * break-glass access records
--   * platform support-access sessions
--   * account / IP / device bans
--   * Discord-link verification challenges
--   * scoped / expiring Shared Care support columns
--   * platform moderation RPCs
--
-- Device bans are based on a hashed stable device identity supplied by the
-- desktop client. Browser-only clients should use an install-scoped device ID;
-- browser fingerprinting is intentionally not used here.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Immutable security events
-- ---------------------------------------------------------------------------
create table if not exists public.recordsweb_security_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  organisation_id uuid null references public.organisations(id) on delete set null,
  actor_id uuid null,
  actor_name text null,
  actor_role text null,
  action text not null,
  severity text not null default 'info' check (severity in ('info','notice','warning','high','critical')),
  entity_type text null,
  entity_id text null,
  patient_id uuid null references public.patients(id) on delete set null,
  session_id uuid null,
  ip_address inet null,
  device_hash text null,
  user_agent text null,
  success boolean not null default true,
  reason text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists recordsweb_security_events_org_time_idx
  on public.recordsweb_security_events (organisation_id, occurred_at desc);
create index if not exists recordsweb_security_events_actor_time_idx
  on public.recordsweb_security_events (actor_id, occurred_at desc);
create index if not exists recordsweb_security_events_patient_time_idx
  on public.recordsweb_security_events (patient_id, occurred_at desc);
create index if not exists recordsweb_security_events_action_time_idx
  on public.recordsweb_security_events (action, occurred_at desc);

alter table public.recordsweb_security_events enable row level security;

-- No normal authenticated user may directly mutate the immutable stream.
revoke insert, update, delete on public.recordsweb_security_events from authenticated, anon;

create or replace function public.recordsweb_block_security_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'RecordsWeb security events are immutable.' using errcode = '42501';
end;
$$;

drop trigger if exists recordsweb_security_events_no_update on public.recordsweb_security_events;
create trigger recordsweb_security_events_no_update
before update or delete on public.recordsweb_security_events
for each row execute function public.recordsweb_block_security_event_mutation();

-- Platform operators can read all events. Organisation management can only
-- read their own organisation through the existing Audit UI/service layer.
drop policy if exists recordsweb_security_events_platform_read on public.recordsweb_security_events;
create policy recordsweb_security_events_platform_read
on public.recordsweb_security_events
for select
to authenticated
using (public.recordsweb_is_platform_operator());

-- ---------------------------------------------------------------------------
-- Active sessions
-- ---------------------------------------------------------------------------
create table if not exists public.recordsweb_security_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organisation_id uuid null references public.organisations(id) on delete cascade,
  device_hash text null,
  device_name text null,
  platform text null,
  app_version text null,
  user_agent text null,
  ip_address inet null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null,
  revoked_by uuid null,
  revoke_reason text null,
  ended_at timestamptz null,
  end_reason text null
);
create index if not exists recordsweb_security_sessions_user_idx
  on public.recordsweb_security_sessions (user_id, last_seen_at desc);
create index if not exists recordsweb_security_sessions_device_idx
  on public.recordsweb_security_sessions (device_hash) where device_hash is not null;

alter table public.recordsweb_security_sessions enable row level security;
revoke insert, update, delete on public.recordsweb_security_sessions from anon;

drop policy if exists recordsweb_security_sessions_self_read on public.recordsweb_security_sessions;
create policy recordsweb_security_sessions_self_read
on public.recordsweb_security_sessions for select to authenticated
using (user_id = auth.uid() or public.recordsweb_is_platform_operator());

-- ---------------------------------------------------------------------------
-- Login attempts / rate-limit support
-- ---------------------------------------------------------------------------
create table if not exists public.recordsweb_login_attempts (
  id bigint generated always as identity primary key,
  attempted_at timestamptz not null default now(),
  email_hash text null,
  organisation_code text null,
  user_id uuid null,
  ip_address inet null,
  device_hash text null,
  success boolean not null default false,
  failure_code text null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists recordsweb_login_attempts_ip_time_idx on public.recordsweb_login_attempts(ip_address, attempted_at desc);
create index if not exists recordsweb_login_attempts_email_time_idx on public.recordsweb_login_attempts(email_hash, attempted_at desc);
create index if not exists recordsweb_login_attempts_device_time_idx on public.recordsweb_login_attempts(device_hash, attempted_at desc);
alter table public.recordsweb_login_attempts enable row level security;
revoke all on public.recordsweb_login_attempts from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Record access trail
-- ---------------------------------------------------------------------------
create table if not exists public.recordsweb_record_access (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  actor_id uuid not null,
  actor_name text null,
  section text not null default 'summary',
  access_type text not null default 'view' check (access_type in ('view','update','download','print','export','break_glass')),
  reason text null,
  session_id uuid null,
  ip_address inet null,
  device_hash text null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists recordsweb_record_access_patient_idx on public.recordsweb_record_access(patient_id, occurred_at desc);
create index if not exists recordsweb_record_access_actor_idx on public.recordsweb_record_access(actor_id, occurred_at desc);
alter table public.recordsweb_record_access enable row level security;
revoke insert, update, delete on public.recordsweb_record_access from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Restricted records + break glass
-- ---------------------------------------------------------------------------
alter table public.patients
  add column if not exists security_classification text not null default 'normal'
  check (security_classification in ('normal','restricted','highly_restricted'));

create table if not exists public.recordsweb_break_glass_grants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  user_id uuid not null,
  reason text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  ended_at timestamptz null,
  reviewed_at timestamptz null,
  reviewed_by uuid null,
  review_outcome text null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists recordsweb_break_glass_user_patient_idx
  on public.recordsweb_break_glass_grants(user_id, patient_id, expires_at desc);
alter table public.recordsweb_break_glass_grants enable row level security;
revoke insert, update, delete on public.recordsweb_break_glass_grants from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Platform support-access sessions (no silent impersonation)
-- ---------------------------------------------------------------------------
create table if not exists public.recordsweb_platform_support_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  operator_name text null,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  reason text not null,
  reference text null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  ended_at timestamptz null,
  ip_address inet null,
  device_hash text null
);
create index if not exists recordsweb_platform_support_sessions_org_idx
  on public.recordsweb_platform_support_sessions(organisation_id, started_at desc);
alter table public.recordsweb_platform_support_sessions enable row level security;
revoke insert, update, delete on public.recordsweb_platform_support_sessions from authenticated, anon;

drop policy if exists recordsweb_platform_support_sessions_platform_read on public.recordsweb_platform_support_sessions;
create policy recordsweb_platform_support_sessions_platform_read
on public.recordsweb_platform_support_sessions for select to authenticated
using (public.recordsweb_is_platform_operator());

-- ---------------------------------------------------------------------------
-- Platform moderation / bans
-- ---------------------------------------------------------------------------
create table if not exists public.recordsweb_platform_bans (
  id uuid primary key default gen_random_uuid(),
  ban_type text not null check (ban_type in ('account','ip','device')),
  user_id uuid null,
  email_normalised text null,
  ip_network cidr null,
  device_hash text null,
  scope text not null default 'platform' check (scope in ('platform','organisation')),
  organisation_id uuid null references public.organisations(id) on delete cascade,
  reason text not null,
  internal_note text null,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  created_by_name text null,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  revoked_by uuid null,
  revoke_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint recordsweb_platform_ban_target_ck check (
    (ban_type = 'account' and (user_id is not null or email_normalised is not null)) or
    (ban_type = 'ip' and ip_network is not null) or
    (ban_type = 'device' and device_hash is not null)
  )
);
create index if not exists recordsweb_platform_bans_user_idx on public.recordsweb_platform_bans(user_id) where revoked_at is null;
create index if not exists recordsweb_platform_bans_ip_idx on public.recordsweb_platform_bans(ip_network) where revoked_at is null;
create index if not exists recordsweb_platform_bans_device_idx on public.recordsweb_platform_bans(device_hash) where revoked_at is null;
create index if not exists recordsweb_platform_bans_active_idx on public.recordsweb_platform_bans(created_at desc) where revoked_at is null;

create or replace function public.recordsweb_ip_in_network(p_ip text, p_network cidr)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_ip), '') is null or p_network is null then return false; end if;
  return trim(p_ip)::inet <<= p_network;
exception when others then
  return false;
end;
$$;

revoke all on function public.recordsweb_ip_in_network(text,cidr) from public, anon, authenticated;
grant execute on function public.recordsweb_ip_in_network(text,cidr) to service_role;
alter table public.recordsweb_platform_bans enable row level security;
revoke all on public.recordsweb_platform_bans from anon;

drop policy if exists recordsweb_platform_bans_platform_read on public.recordsweb_platform_bans;
create policy recordsweb_platform_bans_platform_read
on public.recordsweb_platform_bans for select to authenticated
using (public.recordsweb_is_platform_operator());

-- ---------------------------------------------------------------------------
-- Discord account-link verification
-- ---------------------------------------------------------------------------
create table if not exists public.recordsweb_discord_link_challenges (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  discord_user_id text not null,
  code_hash text not null,
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  attempts integer not null default 0,
  verified_at timestamptz null,
  cancelled_at timestamptz null
);
create index if not exists recordsweb_discord_link_challenges_patient_idx
  on public.recordsweb_discord_link_challenges(patient_id, requested_at desc);
alter table public.recordsweb_discord_link_challenges enable row level security;
revoke all on public.recordsweb_discord_link_challenges from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Shared Care scope and expiry
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.shared_care_workspaces') is not null then
    alter table public.shared_care_workspaces add column if not exists access_scopes text[] not null default array['summary','consultations','medication','documents'];
    alter table public.shared_care_workspaces add column if not exists access_expires_at timestamptz null;
    alter table public.shared_care_workspaces add column if not exists access_granted_by uuid null;
    alter table public.shared_care_workspaces add column if not exists access_granted_at timestamptz null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.recordsweb_platform_create_ban(
  p_ban_type text,
  p_reason text,
  p_user_id uuid default null,
  p_email text default null,
  p_ip_network cidr default null,
  p_device_hash text default null,
  p_scope text default 'platform',
  p_organisation_id uuid default null,
  p_expires_at timestamptz default null,
  p_internal_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_id uuid;
begin
  if not public.recordsweb_is_platform_operator() then
    raise exception 'RecordsWeb platform operator permission is required.' using errcode = '42501';
  end if;
  select * into v_actor from public.profiles where id = auth.uid();
  if trim(coalesce(p_reason,'')) = '' then raise exception 'A moderation reason is required.'; end if;

  insert into public.recordsweb_platform_bans(
    ban_type,user_id,email_normalised,ip_network,device_hash,scope,organisation_id,
    reason,internal_note,created_by,created_by_name,expires_at
  ) values (
    lower(p_ban_type),p_user_id,lower(nullif(trim(p_email),'')),p_ip_network,nullif(trim(p_device_hash),''),
    lower(coalesce(p_scope,'platform')),p_organisation_id,trim(p_reason),nullif(trim(p_internal_note),''),
    auth.uid(),coalesce(v_actor.display_name,v_actor.username,'Platform operator'),p_expires_at
  ) returning id into v_id;

  insert into public.recordsweb_security_events(
    organisation_id,actor_id,actor_name,actor_role,action,severity,entity_type,entity_id,reason,metadata
  ) values (
    p_organisation_id,auth.uid(),coalesce(v_actor.display_name,v_actor.username),v_actor.role,
    'platform.moderation.ban.created','high','platform_ban',v_id::text,trim(p_reason),
    jsonb_build_object('ban_type',lower(p_ban_type),'scope',lower(coalesce(p_scope,'platform')),'target_user_id',p_user_id,'expires_at',p_expires_at)
  );
  return v_id;
end;
$$;

create or replace function public.recordsweb_platform_revoke_ban(p_ban_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
begin
  if not public.recordsweb_is_platform_operator() then
    raise exception 'RecordsWeb platform operator permission is required.' using errcode = '42501';
  end if;
  if trim(coalesce(p_reason,'')) = '' then raise exception 'A revocation reason is required.'; end if;
  select * into v_actor from public.profiles where id = auth.uid();
  update public.recordsweb_platform_bans
     set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = trim(p_reason)
   where id = p_ban_id and revoked_at is null;

  insert into public.recordsweb_security_events(actor_id,actor_name,actor_role,action,severity,entity_type,entity_id,reason)
  values(auth.uid(),coalesce(v_actor.display_name,v_actor.username),v_actor.role,'platform.moderation.ban.revoked','notice','platform_ban',p_ban_id::text,trim(p_reason));
end;
$$;

grant execute on function public.recordsweb_platform_create_ban(text,text,uuid,text,cidr,text,text,uuid,timestamptz,text) to authenticated;
grant execute on function public.recordsweb_platform_revoke_ban(uuid,text) to authenticated;
revoke execute on function public.recordsweb_platform_create_ban(text,text,uuid,text,cidr,text,text,uuid,timestamptz,text) from anon;
revoke execute on function public.recordsweb_platform_revoke_ban(uuid,text) from anon;

-- Own-session revocation. The auth token itself is still ended by the client;
-- server-side security guards reject a revoked session ID immediately.
create or replace function public.recordsweb_revoke_own_security_session(p_session_id uuid, p_reason text default 'user_revoked')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recordsweb_security_sessions
     set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = left(coalesce(p_reason,'user_revoked'),240)
   where id = p_session_id and user_id = auth.uid() and revoked_at is null;
end;
$$;
grant execute on function public.recordsweb_revoke_own_security_session(uuid,text) to authenticated;

-- Organisation scoped read helper for patient access history.
create or replace function public.recordsweb_patient_access_history(p_patient_id uuid, p_limit integer default 50)
returns table(
  occurred_at timestamptz,
  actor_name text,
  section text,
  access_type text,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organisation_id into v_org from public.profiles where id = auth.uid();
  if v_org is null then return; end if;
  return query
    select r.occurred_at,r.actor_name,r.section,r.access_type,r.reason
      from public.recordsweb_record_access r
      join public.patients p on p.id = r.patient_id
     where r.patient_id = p_patient_id
       and p.organisation_id = v_org
     order by r.occurred_at desc
     limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;
grant execute on function public.recordsweb_patient_access_history(uuid,integer) to authenticated;

commit;

-- NOTE: The statements below are intentionally after COMMIT so this migration
-- can be reapplied safely to existing installations. They are individually
-- transactional under PostgreSQL autocommit.

-- ---------------------------------------------------------------------------
-- Permission keys and role-permission mapping
-- ---------------------------------------------------------------------------
create table if not exists public.recordsweb_permission_definitions (
  permission_key text primary key,
  description text not null,
  high_risk boolean not null default false
);

insert into public.recordsweb_permission_definitions(permission_key,description,high_risk) values
  ('patient.read','View patient records',false),
  ('patient.create','Create patients',false),
  ('patient.edit_demographics','Edit patient demographics',false),
  ('patient.delete','Delete patient records',true),
  ('medication.read','View medication',false),
  ('medication.prescribe','Prescribe medication',true),
  ('medication.cancel','Cancel medication',true),
  ('medication.reauthorise','Re-authorise medication',true),
  ('documents.read','View patient documents',false),
  ('documents.download','Download patient documents',true),
  ('documents.issue_fit_note','Issue fit notes',true),
  ('staff.read','View staff directory',false),
  ('staff.manage','Manage staff accounts',true),
  ('staff.permissions.manage','Manage staff permissions',true),
  ('shared_care.read','View Shared Care workspaces',false),
  ('shared_care.create','Create Shared Care workspaces',true),
  ('organisation.settings','Change organisation settings',true),
  ('security.audit.read','View organisation audit/security logs',true),
  ('security.break_glass.review','Review emergency access',true),
  ('security.sessions.manage','Revoke organisation staff sessions',true),
  ('platform.management','Use RecordsWeb Platform Management',true),
  ('platform.moderation','Use platform moderation tools',true)
on conflict(permission_key) do update set description=excluded.description, high_risk=excluded.high_risk;

create table if not exists public.recordsweb_role_permissions (
  id bigint generated always as identity primary key,
  organisation_id uuid null references public.organisations(id) on delete cascade,
  role_name text not null,
  permission_key text not null references public.recordsweb_permission_definitions(permission_key) on delete cascade,
  allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);
create unique index if not exists recordsweb_role_permissions_unique_idx
  on public.recordsweb_role_permissions (coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid), role_name, permission_key);
create index if not exists recordsweb_role_permissions_role_idx on public.recordsweb_role_permissions(role_name, permission_key);
alter table public.recordsweb_role_permissions enable row level security;
revoke insert, update, delete on public.recordsweb_role_permissions from anon;

-- ---------------------------------------------------------------------------
-- Security PIN / step-up tokens
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists security_pin_hash text null;
alter table public.profiles add column if not exists security_pin_set_at timestamptz null;

create table if not exists public.recordsweb_step_up_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  purpose text not null,
  session_id uuid null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz null
);
create index if not exists recordsweb_step_up_tokens_user_idx on public.recordsweb_step_up_tokens(user_id, expires_at desc);
alter table public.recordsweb_step_up_tokens enable row level security;
revoke all on public.recordsweb_step_up_tokens from authenticated, anon;

-- Permission resolver. Platform operators are granted platform-management keys;
-- organisation permissions are resolved from the current user's role/roles.
create or replace function public.recordsweb_has_permission(p_permission_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_role text;
  v_allowed boolean := false;
begin
  if auth.uid() is null then return false; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if not found or coalesce(v_profile.active,true) = false then return false; end if;

  if p_permission_key in ('platform.management','platform.moderation') and public.recordsweb_is_platform_operator() then
    return true;
  end if;

  -- Primary role.
  select coalesce(rp.allowed,false) into v_allowed
    from public.recordsweb_role_permissions rp
   where rp.permission_key = p_permission_key
     and rp.role_name = v_profile.role
     and (rp.organisation_id = v_profile.organisation_id or rp.organisation_id is null)
   order by (rp.organisation_id is not null) desc
   limit 1;
  if coalesce(v_allowed,false) then return true; end if;

  -- Multi-role support where profiles.roles exists as text[].
  begin
    foreach v_role in array coalesce(v_profile.roles, array[]::text[]) loop
      if exists(
        select 1 from public.recordsweb_role_permissions rp
         where rp.permission_key = p_permission_key
           and rp.role_name = v_role
           and rp.allowed = true
           and (rp.organisation_id = v_profile.organisation_id or rp.organisation_id is null)
      ) then return true; end if;
    end loop;
  exception when undefined_column then
    null;
  end;

  return false;
end;
$$;
grant execute on function public.recordsweb_has_permission(text) to authenticated;
revoke execute on function public.recordsweb_has_permission(text) from anon;

-- Sensible global defaults. Organisation-specific rows override these.
insert into public.recordsweb_role_permissions(organisation_id,role_name,permission_key,allowed)
select null, role_name, permission_key, true
from (values
  ('GP Partner','patient.read'),('GP Partner','patient.create'),('GP Partner','patient.edit_demographics'),('GP Partner','patient.delete'),('GP Partner','medication.read'),('GP Partner','medication.prescribe'),('GP Partner','medication.cancel'),('GP Partner','medication.reauthorise'),('GP Partner','documents.read'),('GP Partner','documents.download'),('GP Partner','documents.issue_fit_note'),('GP Partner','staff.read'),('GP Partner','staff.manage'),('GP Partner','staff.permissions.manage'),('GP Partner','shared_care.read'),('GP Partner','shared_care.create'),('GP Partner','organisation.settings'),('GP Partner','security.audit.read'),('GP Partner','security.break_glass.review'),('GP Partner','security.sessions.manage'),
  ('Practice Manager','patient.read'),('Practice Manager','patient.create'),('Practice Manager','patient.edit_demographics'),('Practice Manager','staff.read'),('Practice Manager','staff.manage'),('Practice Manager','staff.permissions.manage'),('Practice Manager','shared_care.read'),('Practice Manager','shared_care.create'),('Practice Manager','organisation.settings'),('Practice Manager','security.audit.read'),('Practice Manager','security.break_glass.review'),('Practice Manager','security.sessions.manage'),
  ('General Practitioner','patient.read'),('General Practitioner','patient.create'),('General Practitioner','patient.edit_demographics'),('General Practitioner','medication.read'),('General Practitioner','medication.prescribe'),('General Practitioner','medication.cancel'),('General Practitioner','medication.reauthorise'),('General Practitioner','documents.read'),('General Practitioner','documents.download'),('General Practitioner','documents.issue_fit_note'),('General Practitioner','shared_care.read'),
  ('GP Registrar (GPST2-3)','patient.read'),('GP Registrar (GPST2-3)','patient.create'),('GP Registrar (GPST2-3)','patient.edit_demographics'),('GP Registrar (GPST2-3)','medication.read'),('GP Registrar (GPST2-3)','medication.prescribe'),('GP Registrar (GPST2-3)','documents.read'),('GP Registrar (GPST2-3)','documents.issue_fit_note'),('GP Registrar (GPST2-3)','shared_care.read'),
  ('Lead Nurse','patient.read'),('Lead Nurse','patient.create'),('Lead Nurse','patient.edit_demographics'),('Lead Nurse','medication.read'),('Lead Nurse','documents.read'),('Lead Nurse','documents.download'),('Lead Nurse','shared_care.read'),
  ('Advanced Clinical Practitioner','patient.read'),('Advanced Clinical Practitioner','patient.create'),('Advanced Clinical Practitioner','patient.edit_demographics'),('Advanced Clinical Practitioner','medication.read'),('Advanced Clinical Practitioner','documents.read'),('Advanced Clinical Practitioner','documents.download'),('Advanced Clinical Practitioner','shared_care.read'),
  ('General Practice Nurse','patient.read'),('General Practice Nurse','patient.edit_demographics'),('General Practice Nurse','medication.read'),('General Practice Nurse','documents.read'),('General Practice Nurse','shared_care.read'),
  ('Nurse Associate','patient.read'),('Nurse Associate','medication.read'),('Nurse Associate','documents.read'),('Nurse Associate','shared_care.read'),
  ('Healthcare Assistant','patient.read'),('Healthcare Assistant','documents.read'),
  ('Patient Coordinator','patient.read'),('Patient Coordinator','patient.create'),('Patient Coordinator','patient.edit_demographics'),('Patient Coordinator','documents.read'),('Patient Coordinator','staff.read')
) as d(role_name,permission_key)
on conflict do nothing;

-- Revoke security sessions automatically when an account is disabled or roles
-- materially change. This is intentionally conservative.
create or replace function public.recordsweb_security_revoke_sessions_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.active is distinct from new.active and new.active = false)
     or (old.role is distinct from new.role)
     or (to_jsonb(old)->'roles' is distinct from to_jsonb(new)->'roles')
     or (to_jsonb(old)->'password_changed_at' is distinct from to_jsonb(new)->'password_changed_at') then
    update public.recordsweb_security_sessions
       set revoked_at = now(), revoke_reason = 'account_security_changed'
     where user_id = new.id and revoked_at is null and ended_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists recordsweb_security_profile_change_revoke on public.profiles;
create trigger recordsweb_security_profile_change_revoke
after update on public.profiles
for each row execute function public.recordsweb_security_revoke_sessions_on_profile_change();
