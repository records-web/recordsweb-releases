-- RecordsWeb 5.2.0
-- Policing record detail pages, CAD/dispatch update timeline and safe deletion cleanup.

begin;

create table if not exists public.police_record_updates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  record_kind text not null,
  record_id uuid not null,
  record_type text,
  update_type text not null default 'note',
  status text,
  unit_callsign text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  constraint police_record_updates_kind_allowed check (record_kind in ('person','vehicle','incident','fpn','police_record')),
  constraint police_record_updates_message_present check (length(trim(message)) > 0)
);

create index if not exists police_record_updates_record_idx
  on public.police_record_updates(organisation_id, record_kind, record_id, created_at desc);

create or replace function public.recordsweb_police_record_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_name text;
begin
  v_org := public.current_organisation_id();
  if v_org is null then
    raise exception 'RecordsWeb organisation context is required.' using errcode = '42501';
  end if;

  new.organisation_id := v_org;
  new.created_by := auth.uid();

  if auth.uid() is not null then
    select nullif(trim(coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name), p.username)), '')
      into v_name
      from public.profiles p
      where p.id = auth.uid();
    if v_name is not null then new.created_by_name := v_name; end if;
  end if;

  if new.record_kind = 'person' and not exists (
    select 1 from public.police_persons r where r.id = new.record_id and r.organisation_id = v_org
  ) then raise exception 'Person record was not found in this organisation.' using errcode = '42501'; end if;

  if new.record_kind = 'vehicle' and not exists (
    select 1 from public.police_vehicles r where r.id = new.record_id and r.organisation_id = v_org
  ) then raise exception 'Vehicle record was not found in this organisation.' using errcode = '42501'; end if;

  if new.record_kind = 'incident' and not exists (
    select 1 from public.police_incidents r where r.id = new.record_id and r.organisation_id = v_org
  ) then raise exception 'Incident record was not found in this organisation.' using errcode = '42501'; end if;

  if new.record_kind = 'fpn' and not exists (
    select 1 from public.police_fpns r where r.id = new.record_id and r.organisation_id = v_org
  ) then raise exception 'FPN record was not found in this organisation.' using errcode = '42501'; end if;

  if new.record_kind = 'police_record' then
    if not exists (
      select 1 from public.police_records r where r.id = new.record_id and r.organisation_id = v_org
    ) then raise exception 'Policing record was not found in this organisation.' using errcode = '42501'; end if;
    if new.record_type is null then
      select r.record_type into new.record_type from public.police_records r where r.id = new.record_id and r.organisation_id = v_org;
    end if;
  else
    new.record_type := null;
  end if;

  return new;
end;
$$;

drop trigger if exists police_record_updates_integrity_guard on public.police_record_updates;
create trigger police_record_updates_integrity_guard
before insert on public.police_record_updates
for each row execute function public.recordsweb_police_record_update_guard();

-- Remove a record's operational update log when the owning record itself is deliberately deleted.
create or replace function public.recordsweb_police_record_update_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  v_kind := case tg_table_name
    when 'police_persons' then 'person'
    when 'police_vehicles' then 'vehicle'
    when 'police_incidents' then 'incident'
    when 'police_fpns' then 'fpn'
    when 'police_records' then 'police_record'
    else null
  end;
  if v_kind is not null then
    delete from public.police_record_updates
      where organisation_id = old.organisation_id
        and record_kind = v_kind
        and record_id = old.id;
  end if;
  return old;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['police_persons','police_vehicles','police_incidents','police_fpns','police_records'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_update_log_cleanup', t);
    execute format('create trigger %I after delete on public.%I for each row execute function public.recordsweb_police_record_update_cleanup()', t || '_update_log_cleanup', t);
  end loop;
end $$;

alter table public.police_record_updates enable row level security;

drop policy if exists police_record_updates_rw52_select on public.police_record_updates;
create policy police_record_updates_rw52_select
on public.police_record_updates for select to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.recordsweb_current_has_product('policing')
);

drop policy if exists police_record_updates_rw52_insert on public.police_record_updates;
create policy police_record_updates_rw52_insert
on public.police_record_updates for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.recordsweb_current_has_product('policing')
);

-- Timeline rows are intentionally append-only from the client. Parent-record deletion
-- is handled by the security-definer cleanup trigger above.
grant select, insert on public.police_record_updates to authenticated;
revoke update, delete on public.police_record_updates from authenticated;

commit;
