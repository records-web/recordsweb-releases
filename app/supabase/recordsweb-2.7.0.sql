-- RecordsWeb 2.7.0 - account recovery, audit, clinical alerts, version history,
-- recoverable deletes and security/session support.
-- Safe to re-run after the existing RecordsWeb schema/migrations.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists password_changed_at timestamptz;
alter table public.profiles add column if not exists last_login_at timestamptz;

-- Immutable audit trail. Staff may append their own events; Management may read
-- organisation-wide activity. Ordinary staff can read their own account events.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete restrict,
  actor_id uuid default auth.uid() references public.profiles(id) on delete set null,
  actor_name text,
  actor_role text,
  patient_id uuid references public.patients(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_org_created_idx on public.audit_log (organisation_id, created_at desc);
create index if not exists audit_log_actor_created_idx on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_patient_created_idx on public.audit_log (patient_id, created_at desc);

create or replace function public.recordsweb_audit_defaults()
returns trigger language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype;
begin
  if new.actor_id is null then new.actor_id := auth.uid(); end if;
  if new.organisation_id is null then new.organisation_id := public.current_organisation_id(); end if;
  if new.actor_id is not null and (new.actor_name is null or new.actor_role is null) then
    select * into p from public.profiles where id = new.actor_id;
    new.actor_name := coalesce(new.actor_name, p.display_name, p.username, 'Staff member');
    new.actor_role := coalesce(new.actor_role, p.role, 'Staff');
    if new.organisation_id is null then new.organisation_id := p.organisation_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists audit_log_defaults on public.audit_log;
create trigger audit_log_defaults before insert on public.audit_log for each row execute function public.recordsweb_audit_defaults();

alter table public.audit_log enable row level security;
grant select, insert on public.audit_log to authenticated;
revoke update, delete on public.audit_log from authenticated, anon;
drop policy if exists audit_log_read on public.audit_log;
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (actor_id = auth.uid() or public.current_user_is_management())
);
create policy audit_log_insert on public.audit_log for insert to authenticated with check (
  organisation_id = public.current_organisation_id() and actor_id = auth.uid()
);

create or replace function public.recordsweb_mark_login()
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  update public.profiles set last_login_at=now(), updated_at=now() where id=auth.uid();
  return true;
end $$;
create or replace function public.recordsweb_mark_password_changed()
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  update public.profiles set must_change_password=false,password_changed_at=now(),updated_at=now() where id=auth.uid();
  return true;
end $$;
grant execute on function public.recordsweb_mark_login() to authenticated;
grant execute on function public.recordsweb_mark_password_changed() to authenticated;


-- Recent password history. Only the service-role Edge Function can compare or
-- append hashes. RecordsWeb keeps the latest five password choices to prevent
-- trivial reuse without exposing password material to the Electron client.
create table if not exists public.password_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists password_history_user_created_idx on public.password_history(user_id,created_at desc);
alter table public.password_history enable row level security;
revoke all on public.password_history from anon,authenticated;

create or replace function public.recordsweb_service_password_recently_used(p_user_id uuid,p_password text)
returns boolean language sql security definer set search_path=public,extensions as $$
  select exists(
    select 1 from (
      select password_hash from public.password_history
      where user_id=p_user_id order by created_at desc limit 5
    ) h where h.password_hash=crypt(coalesce(p_password,''),h.password_hash)
  );
$$;

create or replace function public.recordsweb_service_record_password(p_user_id uuid,p_password text)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
begin
  if p_password is null or length(p_password)<1 then raise exception 'Password is required.'; end if;
  insert into public.password_history(user_id,password_hash) values(p_user_id,crypt(p_password,gen_salt('bf',10)));
  delete from public.password_history
  where user_id=p_user_id and id not in (
    select id from public.password_history where user_id=p_user_id order by created_at desc limit 5
  );
  return true;
end $$;
revoke all on function public.recordsweb_service_password_recently_used(uuid,text) from public,anon,authenticated;
revoke all on function public.recordsweb_service_record_password(uuid,text) from public,anon,authenticated;
grant execute on function public.recordsweb_service_password_recently_used(uuid,text) to service_role;
grant execute on function public.recordsweb_service_record_password(uuid,text) to service_role;

-- Six-digit account recovery code. It is deliberately separate from the
-- prescribing PIN and is never stored in plaintext.
create table if not exists public.account_recovery (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  recovery_code_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.account_recovery enable row level security;
revoke all on public.account_recovery from anon, authenticated;

create or replace function public.recordsweb_has_recovery_code()
returns boolean language sql security definer set search_path=public,extensions as $$
  select exists(select 1 from public.account_recovery r join public.profiles p on p.id=r.user_id where r.user_id=auth.uid() and p.active=true);
$$;

create or replace function public.recordsweb_set_recovery_code(p_new_code text, p_current_code text default null)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare r public.account_recovery%rowtype;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_new_code is null or p_new_code !~ '^[0-9]{6}$' then raise exception 'Recovery code must contain exactly 6 digits.'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and active=true) then raise exception 'Your RecordsWeb profile is not active.'; end if;
  select * into r from public.account_recovery where user_id=auth.uid();
  if found then
    if p_current_code is null or p_current_code !~ '^[0-9]{6}$' or r.recovery_code_hash <> crypt(p_current_code,r.recovery_code_hash) then raise exception 'Current recovery code is incorrect.'; end if;
    update public.account_recovery set recovery_code_hash=crypt(p_new_code,gen_salt('bf',10)),failed_attempts=0,locked_until=null,updated_at=now() where user_id=auth.uid();
  else
    insert into public.account_recovery(user_id,recovery_code_hash) values(auth.uid(),crypt(p_new_code,gen_salt('bf',10)));
  end if;
  return true;
end $$;
grant execute on function public.recordsweb_has_recovery_code() to authenticated;
grant execute on function public.recordsweb_set_recovery_code(text,text) to authenticated;

-- Called only by the service-role Edge Function. Five failed recovery attempts
-- lock recovery for 15 minutes.
create or replace function public.recordsweb_service_verify_recovery_code(p_user_id uuid,p_code text)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare r public.account_recovery%rowtype;
begin
  select * into r from public.account_recovery where user_id=p_user_id for update;
  if not found then return false; end if;
  if r.locked_until is not null and r.locked_until>now() then return false; end if;
  if r.recovery_code_hash = crypt(coalesce(p_code,''),r.recovery_code_hash) then
    update public.account_recovery set failed_attempts=0,locked_until=null,updated_at=now() where user_id=p_user_id;
    return true;
  end if;
  update public.account_recovery set
    failed_attempts=r.failed_attempts+1,
    locked_until=case when r.failed_attempts+1>=5 then now()+interval '15 minutes' else null end,
    updated_at=now()
  where user_id=p_user_id;
  return false;
end $$;
revoke all on function public.recordsweb_service_verify_recovery_code(uuid,text) from public,anon,authenticated;
grant execute on function public.recordsweb_service_verify_recovery_code(uuid,text) to service_role;

-- Patient clinical alerts shown consistently beneath the normal patient banner.
create table if not exists public.patient_alerts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  message text not null,
  severity text not null default 'Warning' check(severity in('Information','Warning','High')),
  active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists patient_alerts_patient_idx on public.patient_alerts(patient_id,created_at desc);
alter table public.patient_alerts enable row level security;
grant select,insert,update on public.patient_alerts to authenticated;
drop policy if exists patient_alerts_read on public.patient_alerts;
drop policy if exists patient_alerts_insert on public.patient_alerts;
drop policy if exists patient_alerts_update on public.patient_alerts;
create policy patient_alerts_read on public.patient_alerts for select to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.organisation_id=public.current_organisation_id()));
create policy patient_alerts_insert on public.patient_alerts for insert to authenticated with check(exists(select 1 from public.patients p where p.id=patient_id and p.organisation_id=public.current_organisation_id()));
create policy patient_alerts_update on public.patient_alerts for update to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.organisation_id=public.current_organisation_id())) with check(exists(select 1 from public.patients p where p.id=patient_id and p.organisation_id=public.current_organisation_id()));
drop trigger if exists recordsweb_patient_change on public.patient_alerts;
create trigger recordsweb_patient_change after insert or update or delete on public.patient_alerts for each row execute function public.recordsweb_log_patient_record_change();

-- Every saved document state is preserved as an immutable version snapshot.
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  changed_by uuid default auth.uid() references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique(document_id,version_number)
);
create index if not exists document_versions_doc_idx on public.document_versions(document_id,version_number desc);
alter table public.document_versions enable row level security;
grant select,insert on public.document_versions to authenticated;
revoke update,delete on public.document_versions from authenticated,anon;
drop policy if exists document_versions_read on public.document_versions;
drop policy if exists document_versions_insert on public.document_versions;
create policy document_versions_read on public.document_versions for select to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.organisation_id=public.current_organisation_id()));
create policy document_versions_insert on public.document_versions for insert to authenticated with check(changed_by=auth.uid() and exists(select 1 from public.patients p where p.id=patient_id and p.organisation_id=public.current_organisation_id()));

-- Recoverable deletion store. RecordsWeb 2.7 initially uses this for organisation
-- notepad/news deletes; the schema can safely hold future record types too.
create table if not exists public.deleted_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete restrict,
  patient_id uuid references public.patients(id) on delete set null,
  source_table text not null,
  source_id uuid not null,
  snapshot jsonb not null,
  deleted_by uuid default auth.uid() references public.profiles(id) on delete set null,
  deleted_by_name text,
  deleted_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references public.profiles(id) on delete set null
);
create index if not exists deleted_records_org_idx on public.deleted_records(organisation_id,deleted_at desc);
create or replace function public.recordsweb_deleted_defaults()
returns trigger language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype;
begin
  new.organisation_id:=coalesce(new.organisation_id,public.current_organisation_id());
  new.deleted_by:=coalesce(new.deleted_by,auth.uid());
  select * into p from public.profiles where id=new.deleted_by;
  new.deleted_by_name:=coalesce(new.deleted_by_name,p.display_name,p.username);
  return new;
end $$;
drop trigger if exists deleted_records_defaults on public.deleted_records;
create trigger deleted_records_defaults before insert on public.deleted_records for each row execute function public.recordsweb_deleted_defaults();
alter table public.deleted_records enable row level security;
grant select,insert,update on public.deleted_records to authenticated;
drop policy if exists deleted_records_read on public.deleted_records;
drop policy if exists deleted_records_insert on public.deleted_records;
drop policy if exists deleted_records_update on public.deleted_records;
create policy deleted_records_read on public.deleted_records for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_user_is_management());
create policy deleted_records_insert on public.deleted_records for insert to authenticated with check(organisation_id=public.current_organisation_id() and deleted_by=auth.uid());
create policy deleted_records_update on public.deleted_records for update to authenticated using(organisation_id=public.current_organisation_id() and public.current_user_is_management()) with check(organisation_id=public.current_organisation_id() and public.current_user_is_management());

create or replace function public.recordsweb_restore_deleted_record(p_deleted_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.deleted_records%rowtype; s jsonb;
begin
  if not public.current_user_is_management() then raise exception 'Management permission is required.'; end if;
  select * into r from public.deleted_records where id=p_deleted_id and organisation_id=public.current_organisation_id() and restored_at is null for update;
  if not found then raise exception 'Deleted item not found.'; end if;
  s:=r.snapshot;
  if r.source_table='organisation_notepad' then
    insert into public.organisation_notepad(id,organisation_id,title,body,created_by,created_by_name,created_by_username,created_at,updated_at)
    values((s->>'id')::uuid,(s->>'organisation_id')::uuid,s->>'title',s->>'body',nullif(s->>'created_by','')::uuid,s->>'created_by_name',s->>'created_by_username',coalesce((s->>'created_at')::timestamptz,now()),now())
    on conflict(id) do nothing;
  elsif r.source_table='organisation_news' then
    insert into public.organisation_news(id,organisation_id,title,body,category,published_at,expires_at,active,created_by,author_name,created_at,updated_at)
    values((s->>'id')::uuid,(s->>'organisation_id')::uuid,s->>'title',s->>'body',coalesce(s->>'category','News'),coalesce((s->>'published_at')::date,current_date),nullif(s->>'expires_at','')::date,coalesce((s->>'active')::boolean,true),nullif(s->>'created_by','')::uuid,s->>'author_name',coalesce((s->>'created_at')::timestamptz,now()),now())
    on conflict(id) do nothing;
  else
    raise exception 'This RecordsWeb version cannot restore source type %.',r.source_table;
  end if;
  update public.deleted_records set restored_at=now(),restored_by=auth.uid() where id=r.id;
  return true;
end $$;
grant execute on function public.recordsweb_restore_deleted_record(uuid) to authenticated;
