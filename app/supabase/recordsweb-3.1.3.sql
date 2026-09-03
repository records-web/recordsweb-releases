-- RecordsWeb 3.1.3 - Management session visibility and staff profile activity.
-- Safe to run after the existing RecordsWeb migrations.

create table if not exists public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_key uuid not null unique,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  app_version text,
  device_name text,
  platform text
);

create index if not exists staff_sessions_user_started_idx on public.staff_sessions(user_id, started_at desc);
create index if not exists staff_sessions_org_seen_idx on public.staff_sessions(organisation_id, last_seen_at desc);

alter table public.staff_sessions enable row level security;
grant select on public.staff_sessions to authenticated;
revoke insert, update, delete on public.staff_sessions from anon, authenticated;

drop policy if exists staff_sessions_read on public.staff_sessions;
create policy staff_sessions_read on public.staff_sessions
for select to authenticated
using (
  user_id = auth.uid()
  or (
    organisation_id = public.current_organisation_id()
    and public.current_user_is_management()
  )
);

create or replace function public.recordsweb_start_staff_session(
  p_session_key uuid,
  p_app_version text default null,
  p_device_name text default null,
  p_platform text default null
)
returns public.staff_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  result public.staff_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_session_key is null then raise exception 'A session key is required.'; end if;

  select * into p from public.profiles where id = auth.uid() and active = true;
  if not found then raise exception 'Your RecordsWeb profile is not active.'; end if;

  insert into public.staff_sessions as ss (
    organisation_id, user_id, session_key, started_at, last_seen_at,
    ended_at, end_reason, app_version, device_name, platform
  ) values (
    p.organisation_id, p.id, p_session_key, now(), now(),
    null, null, nullif(left(coalesce(p_app_version,''),40),''),
    nullif(left(coalesce(p_device_name,''),120),''),
    nullif(left(coalesce(p_platform,''),120),'')
  )
  on conflict (session_key) do update set
    last_seen_at = now(),
    ended_at = null,
    end_reason = null,
    app_version = coalesce(excluded.app_version, ss.app_version),
    device_name = coalesce(excluded.device_name, ss.device_name),
    platform = coalesce(excluded.platform, ss.platform)
  where ss.user_id = auth.uid()
  returning * into result;

  return result;
end $$;

create or replace function public.recordsweb_heartbeat_staff_session(p_session_key uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  update public.staff_sessions
    set last_seen_at = now()
    where session_key = p_session_key
      and user_id = auth.uid()
      and ended_at is null;
  return found;
end $$;

create or replace function public.recordsweb_end_staff_session(p_session_key uuid, p_reason text default 'signed_out')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  update public.staff_sessions
    set last_seen_at = now(),
        ended_at = coalesce(ended_at, now()),
        end_reason = coalesce(nullif(left(trim(coalesce(p_reason,'')),80),''), 'signed_out')
    where session_key = p_session_key
      and user_id = auth.uid();
  return found;
end $$;

revoke all on function public.recordsweb_start_staff_session(uuid,text,text,text) from public, anon;
revoke all on function public.recordsweb_heartbeat_staff_session(uuid) from public, anon;
revoke all on function public.recordsweb_end_staff_session(uuid,text) from public, anon;
grant execute on function public.recordsweb_start_staff_session(uuid,text,text,text) to authenticated;
grant execute on function public.recordsweb_heartbeat_staff_session(uuid) to authenticated;
grant execute on function public.recordsweb_end_staff_session(uuid,text) to authenticated;

-- Supabase Realtime lets Management see sign-in/sign-out state change without
-- refreshing the account list. The DO block makes this migration re-runnable.
do $$
begin
  alter publication supabase_realtime add table public.staff_sessions;
exception
  when duplicate_object then null;
end $$;
