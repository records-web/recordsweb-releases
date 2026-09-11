-- RecordsWeb 3.2.1 — platform operator management
-- Platform-wide controls are no longer available to community Management.
-- Authorised operator identities: gus.farnsworth@XX.XX or alfie-james@XX.XX, where XX.XX matches the
-- authenticated user's active RecordsWeb organisation profile.

begin;

create or replace function public.recordsweb_is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with operator_identity as (
    select
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) as email,
      lower(coalesce(public.current_organisation_code(), '')) as organisation_code
  )
  select coalesce((
    select
      email ~ '^(gus\.farnsworth|alfie-james)@[a-z]{2}\.[a-z]{2}$'
      and split_part(email, '@', 2) = organisation_code
    from operator_identity
  ), false);
$$;

revoke all on function public.recordsweb_is_platform_operator() from public;
grant execute on function public.recordsweb_is_platform_operator() to authenticated;

-- Keep the access-request reviewer rule aligned with the platform operator rule.
create or replace function public.recordsweb_is_access_request_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.recordsweb_is_platform_operator();
$$;
revoke all on function public.recordsweb_is_access_request_reviewer() from public;
grant execute on function public.recordsweb_is_access_request_reviewer() to authenticated;

create table if not exists public.recordsweb_platform_state (
  id text primary key default 'global' check (id = 'global'),
  maintenance_enabled boolean not null default false,
  maintenance_message text not null default 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.',
  maintenance_estimated_end_at timestamptz,
  maintenance_enabled_at timestamptz,
  maintenance_enabled_by_name text,
  updated_at timestamptz not null default now()
);

insert into public.recordsweb_platform_state (id)
values ('global')
on conflict (id) do nothing;

alter table public.recordsweb_platform_state enable row level security;
revoke all on public.recordsweb_platform_state from anon, authenticated;
grant select on public.recordsweb_platform_state to anon, authenticated;

drop policy if exists recordsweb_platform_state_public_read on public.recordsweb_platform_state;
create policy recordsweb_platform_state_public_read
on public.recordsweb_platform_state
for select
to anon, authenticated
using (id = 'global');

create or replace function public.recordsweb_public_platform_state()
returns table (
  organisation_code text,
  enabled boolean,
  message text,
  estimated_end_at timestamptz,
  enabled_at timestamptz,
  enabled_by_name text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    'PLATFORM'::text,
    s.maintenance_enabled,
    s.maintenance_message,
    s.maintenance_estimated_end_at,
    s.maintenance_enabled_at,
    s.maintenance_enabled_by_name,
    s.updated_at
  from public.recordsweb_platform_state s
  where s.id = 'global';
$$;
revoke all on function public.recordsweb_public_platform_state() from public;
grant execute on function public.recordsweb_public_platform_state() to anon, authenticated;

create or replace function public.recordsweb_set_platform_maintenance(
  p_enabled boolean,
  p_message text default null,
  p_estimated_end_at timestamptz default null
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
security definer
set search_path = public
as $$
declare
  v_message text;
  v_name text;
begin
  if not public.recordsweb_is_platform_operator() then
    raise exception 'Access denied: RecordsWeb platform operator permission is required.' using errcode = '42501';
  end if;

  v_message := left(trim(coalesce(p_message, '')), 500);
  if v_message = '' then
    v_message := 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.';
  end if;

  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), auth.jwt() ->> 'email', 'RecordsWeb operator')
  into v_name
  from public.profiles p
  where p.id = auth.uid();

  update public.recordsweb_platform_state
  set
    maintenance_enabled = coalesce(p_enabled, false),
    maintenance_message = v_message,
    maintenance_estimated_end_at = p_estimated_end_at,
    maintenance_enabled_at = case when coalesce(p_enabled, false) then coalesce(maintenance_enabled_at, now()) else null end,
    maintenance_enabled_by_name = case when coalesce(p_enabled, false) then v_name else null end,
    updated_at = now()
  where id = 'global';

  return query select * from public.recordsweb_public_platform_state();
end;
$$;
revoke all on function public.recordsweb_set_platform_maintenance(boolean,text,timestamptz) from public;
grant execute on function public.recordsweb_set_platform_maintenance(boolean,text,timestamptz) to authenticated;

-- Community clients must no longer be able to write the legacy per-organisation
-- maintenance state. Older clients therefore cannot bypass the new boundary.
do $$
begin
  if to_regclass('public.system_maintenance') is not null then
    update public.system_maintenance
    set enabled = false, estimated_end_at = null, enabled_at = null, updated_at = now();
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.recordsweb_set_maintenance(boolean,text,timestamp with time zone)') is not null then
    execute 'revoke all on function public.recordsweb_set_maintenance(boolean,text,timestamptz) from public';
    execute 'revoke all on function public.recordsweb_set_maintenance(boolean,text,timestamptz) from authenticated';
    execute 'revoke all on function public.recordsweb_set_maintenance(boolean,text,timestamptz) from anon';
  end if;
end $$;

create or replace function public.recordsweb_operator_list_releases()
returns table (
  id uuid,
  version text,
  channel text,
  release_notes text,
  active boolean,
  published_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.recordsweb_is_platform_operator() then
    raise exception 'Access denied: RecordsWeb platform operator permission is required.' using errcode = '42501';
  end if;
  return query
  select r.id, r.version, r.channel, r.release_notes, r.active, r.published_at, r.created_at
  from public.app_releases r
  order by r.published_at desc, r.created_at desc
  limit 100;
end;
$$;
revoke all on function public.recordsweb_operator_list_releases() from public;
grant execute on function public.recordsweb_operator_list_releases() to authenticated;

create or replace function public.recordsweb_operator_publish_release(
  p_version text,
  p_channel text default 'stable',
  p_release_notes text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_version text := trim(coalesce(p_version, ''));
  v_channel text := lower(trim(coalesce(p_channel, 'stable')));
begin
  if not public.recordsweb_is_platform_operator() then
    raise exception 'Access denied: RecordsWeb platform operator permission is required.' using errcode = '42501';
  end if;
  if v_version !~ '^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$' then
    raise exception 'A semantic RecordsWeb version is required.';
  end if;
  if v_channel !~ '^[a-z0-9_-]{1,32}$' then
    raise exception 'Invalid release channel.';
  end if;

  insert into public.app_releases (version, channel, release_notes, active, published_at)
  values (v_version, v_channel, nullif(trim(coalesce(p_release_notes, '')), ''), coalesce(p_active, true), now())
  on conflict (channel, version) do update set
    release_notes = excluded.release_notes,
    active = excluded.active,
    published_at = now()
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.recordsweb_operator_publish_release(text,text,text,boolean) from public;
grant execute on function public.recordsweb_operator_publish_release(text,text,text,boolean) to authenticated;

create or replace function public.recordsweb_operator_set_release_active(
  p_release_id uuid,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.recordsweb_is_platform_operator() then
    raise exception 'Access denied: RecordsWeb platform operator permission is required.' using errcode = '42501';
  end if;
  update public.app_releases set active = coalesce(p_active, false) where id = p_release_id;
  if not found then raise exception 'Release not found.'; end if;
  return p_release_id;
end;
$$;
revoke all on function public.recordsweb_operator_set_release_active(uuid,boolean) from public;
grant execute on function public.recordsweb_operator_set_release_active(uuid,boolean) to authenticated;

-- Realtime lets already-open clients react to global maintenance immediately.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'recordsweb_platform_state'
     ) then
    alter publication supabase_realtime add table public.recordsweb_platform_state;
  end if;
end $$;

commit;
