-- RecordsWeb 3.1.0 - organisation maintenance mode.
-- Safe to re-run after the existing RecordsWeb schema/migrations.
-- Normal staff are blocked before login while maintenance is enabled.
-- Management can still authenticate through the compact maintenance screen.

create table if not exists public.system_maintenance (
  organisation_code text primary key,
  organisation_id uuid not null unique references public.organisations(id) on delete cascade,
  enabled boolean not null default false,
  message text not null default 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.',
  estimated_end_at timestamptz,
  enabled_at timestamptz,
  enabled_by uuid references public.profiles(id) on delete set null,
  enabled_by_name text,
  updated_at timestamptz not null default now()
);

insert into public.system_maintenance (organisation_code, organisation_id)
select o.org_code, o.id
from public.organisations o
where o.org_code = 'GW.HC'
on conflict (organisation_code) do update set organisation_id = excluded.organisation_id;

alter table public.system_maintenance enable row level security;
revoke all on public.system_maintenance from anon;
revoke insert, update, delete on public.system_maintenance from authenticated;
grant select on public.system_maintenance to authenticated;

drop policy if exists system_maintenance_staff_read on public.system_maintenance;
create policy system_maintenance_staff_read
on public.system_maintenance
for select
to authenticated
using (organisation_id = public.current_organisation_id());

-- Public pre-login function. It deliberately returns only the non-sensitive
-- maintenance fields required to decide whether the login window may be shown.
create or replace function public.recordsweb_public_maintenance_state(
  p_organisation_code text default 'GW.HC'
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
begin
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
  where lower(m.organisation_code) = lower(coalesce(p_organisation_code, 'GW.HC'))
  limit 1;

  if not found then
    return query select
      coalesce(p_organisation_code, 'GW.HC')::text,
      false,
      'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.'::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::timestamptz;
  end if;
end;
$$;

grant execute on function public.recordsweb_public_maintenance_state(text) to anon, authenticated;

create or replace function public.recordsweb_set_maintenance(
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
  v_profile public.profiles%rowtype;
  v_org public.organisations%rowtype;
  v_message text;
  v_previous_enabled boolean;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and active = true and is_management = true;

  if not found then raise exception 'Management permission is required.'; end if;

  select * into v_org from public.organisations where id = v_profile.organisation_id;
  if not found then raise exception 'The RecordsWeb organisation could not be verified.'; end if;

  select m.enabled into v_previous_enabled from public.system_maintenance m where m.organisation_code = v_org.org_code;

  v_message := left(trim(coalesce(p_message, '')), 500);
  if v_message = '' then
    v_message := 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.';
  end if;

  insert into public.system_maintenance (
    organisation_code, organisation_id, enabled, message, estimated_end_at,
    enabled_at, enabled_by, enabled_by_name, updated_at
  ) values (
    v_org.org_code, v_org.id, coalesce(p_enabled, false), v_message, p_estimated_end_at,
    case when coalesce(p_enabled, false) then now() else null end,
    auth.uid(), coalesce(v_profile.display_name, v_profile.username, 'Management'), now()
  )
  on conflict on constraint system_maintenance_pkey do update set
    organisation_id = excluded.organisation_id,
    enabled = excluded.enabled,
    message = excluded.message,
    estimated_end_at = excluded.estimated_end_at,
    enabled_at = case when excluded.enabled then now() else null end,
    enabled_by = excluded.enabled_by,
    enabled_by_name = excluded.enabled_by_name,
    updated_at = now();

  if to_regclass('public.audit_log') is not null then
    insert into public.audit_log (
      organisation_id, actor_id, actor_name, actor_role,
      action, entity_type, description, metadata
    ) values (
      v_profile.organisation_id,
      auth.uid(),
      v_profile.display_name,
      v_profile.role,
      case
        when v_previous_enabled is distinct from coalesce(p_enabled, false) and coalesce(p_enabled, false) then 'system.maintenance.enabled'
        when v_previous_enabled is distinct from coalesce(p_enabled, false) and not coalesce(p_enabled, false) then 'system.maintenance.disabled'
        else 'system.maintenance.details.updated'
      end,
      'system_maintenance',
      case
        when v_previous_enabled is distinct from coalesce(p_enabled, false) and coalesce(p_enabled, false) then 'Enabled RecordsWeb maintenance mode.'
        when v_previous_enabled is distinct from coalesce(p_enabled, false) and not coalesce(p_enabled, false) then 'Disabled RecordsWeb maintenance mode.'
        else 'Updated RecordsWeb maintenance details.'
      end,
      jsonb_build_object('message', v_message, 'estimated_end_at', p_estimated_end_at)
    );
  end if;

  return query
  select m.organisation_code, m.enabled, m.message, m.estimated_end_at,
         m.enabled_at, m.enabled_by_name, m.updated_at
  from public.system_maintenance m
  where m.organisation_code = v_org.org_code;
end;
$$;

grant execute on function public.recordsweb_set_maintenance(boolean, text, timestamptz) to authenticated;
revoke execute on function public.recordsweb_set_maintenance(boolean, text, timestamptz) from anon;

-- Realtime is used for already-signed-in staff. The public compact maintenance
-- window polls the safe public function instead, so anonymous table access is
-- not required.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'system_maintenance'
     ) then
    alter publication supabase_realtime add table public.system_maintenance;
  end if;
end $$;
