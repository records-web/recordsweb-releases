-- RecordsWeb 3.6.0
-- Shared Care Workspaces: connected care networks, patient discussion, shared work queue,
-- unified workspace handover visibility and acknowledgement.
-- Requires the RecordsWeb Shared Care schema and the 3.5.0 care workspace migration.

begin;

create table if not exists public.recordsweb_shared_care_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Shared Care Network',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recordsweb_shared_care_workspace_members (
  workspace_id uuid not null references public.recordsweb_shared_care_workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, organisation_id)
);

create unique index if not exists recordsweb_sc_workspace_member_one_workspace_idx
  on public.recordsweb_shared_care_workspace_members(organisation_id);

create table if not exists public.recordsweb_shared_care_patient_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.recordsweb_shared_care_workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recordsweb_shared_care_patient_thread_members (
  thread_id uuid not null references public.recordsweb_shared_care_patient_threads(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (thread_id, organisation_id, patient_id)
);

create unique index if not exists recordsweb_sc_patient_thread_patient_idx
  on public.recordsweb_shared_care_patient_thread_members(patient_id);
create index if not exists recordsweb_sc_patient_thread_org_idx
  on public.recordsweb_shared_care_patient_thread_members(organisation_id, thread_id);

create table if not exists public.recordsweb_shared_care_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.recordsweb_shared_care_workspaces(id) on delete cascade,
  patient_thread_id uuid references public.recordsweb_shared_care_patient_threads(id) on delete cascade,
  source_organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  message_type text not null default 'discussion' check (message_type in ('discussion','clinical_update','request','system')),
  body text not null,
  reference_type text,
  reference_id text,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists recordsweb_sc_messages_workspace_idx
  on public.recordsweb_shared_care_messages(workspace_id, created_at desc);
create index if not exists recordsweb_sc_messages_thread_idx
  on public.recordsweb_shared_care_messages(patient_thread_id, created_at desc);

create table if not exists public.recordsweb_shared_care_workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.recordsweb_shared_care_workspaces(id) on delete cascade,
  patient_thread_id uuid references public.recordsweb_shared_care_patient_threads(id) on delete cascade,
  source_organisation_id uuid not null references public.organisations(id) on delete cascade,
  target_organisation_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  details text,
  priority text not null default 'Routine' check (priority in ('Routine','High','Urgent','Immediate')),
  status text not null default 'open' check (status in ('open','accepted','completed','cancelled')),
  due_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  accepted_by uuid references public.profiles(id) on delete set null,
  completed_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recordsweb_sc_tasks_workspace_idx
  on public.recordsweb_shared_care_workspace_tasks(workspace_id, status, created_at desc);
create index if not exists recordsweb_sc_tasks_target_idx
  on public.recordsweb_shared_care_workspace_tasks(target_organisation_id, status, due_at);
create index if not exists recordsweb_sc_tasks_thread_idx
  on public.recordsweb_shared_care_workspace_tasks(patient_thread_id, created_at desc);

-- Attach the existing transfer-of-care records to their wider care workspace.
alter table public.recordsweb_shared_care_transfers
  add column if not exists workspace_id uuid references public.recordsweb_shared_care_workspaces(id) on delete set null,
  add column if not exists patient_thread_id uuid references public.recordsweb_shared_care_patient_threads(id) on delete set null,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references public.profiles(id) on delete set null;

alter table public.recordsweb_shared_care_transfers
  drop constraint if exists recordsweb_shared_care_transfers_status_check;
alter table public.recordsweb_shared_care_transfers
  add constraint recordsweb_shared_care_transfers_status_check
  check (status in ('sent','received','viewed','acknowledged','actioned'));

create index if not exists recordsweb_sc_transfers_workspace_idx
  on public.recordsweb_shared_care_transfers(workspace_id, created_at desc);
create index if not exists recordsweb_sc_transfers_thread_idx
  on public.recordsweb_shared_care_transfers(patient_thread_id, created_at desc);

create or replace function public.recordsweb_360_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists recordsweb_sc_workspaces_touch_updated_at on public.recordsweb_shared_care_workspaces;
create trigger recordsweb_sc_workspaces_touch_updated_at
before update on public.recordsweb_shared_care_workspaces
for each row execute function public.recordsweb_360_touch_updated_at();

drop trigger if exists recordsweb_sc_patient_threads_touch_updated_at on public.recordsweb_shared_care_patient_threads;
create trigger recordsweb_sc_patient_threads_touch_updated_at
before update on public.recordsweb_shared_care_patient_threads
for each row execute function public.recordsweb_360_touch_updated_at();

drop trigger if exists recordsweb_sc_tasks_touch_updated_at on public.recordsweb_shared_care_workspace_tasks;
create trigger recordsweb_sc_tasks_touch_updated_at
before update on public.recordsweb_shared_care_workspace_tasks
for each row execute function public.recordsweb_360_touch_updated_at();

-- Internal helper: resolve an organisation's full active Shared Care connected component,
-- then create or merge a single persistent workspace for that component.
create or replace function public.recordsweb_shared_care_ensure_workspace_for_org(p_organisation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_component uuid[];
  v_existing uuid[];
  v_workspace uuid;
  v_merge uuid;
begin
  if p_organisation_id is null then return null; end if;

  with recursive component(org_id) as (
    select p_organisation_id
    union
    select case when l.organisation_a_id = c.org_id then l.organisation_b_id else l.organisation_a_id end
    from component c
    join public.recordsweb_shared_care_links l
      on l.status = 'active'
     and c.org_id in (l.organisation_a_id, l.organisation_b_id)
  )
  select array_agg(distinct org_id) into v_component from component;

  -- A single organisation with no active Shared Care relationship does not need a workspace yet.
  if coalesce(array_length(v_component, 1), 0) < 2 then return null; end if;

  select array_agg(x.workspace_id) into v_existing
  from (
    select wm.workspace_id, min(w.created_at) as created_at
    from public.recordsweb_shared_care_workspace_members wm
    join public.recordsweb_shared_care_workspaces w on w.id = wm.workspace_id
    where wm.organisation_id = any(v_component)
    group by wm.workspace_id
    order by min(w.created_at), wm.workspace_id
  ) x;

  v_workspace := case when array_length(v_existing, 1) > 0 then v_existing[1] else null end;
  if v_workspace is null then
    insert into public.recordsweb_shared_care_workspaces(name)
    values ('Shared Care Network') returning id into v_workspace;
  end if;

  -- If a new link joins two previously separate care networks, merge their history into
  -- the oldest workspace so discussions/tasks remain continuous.
  if array_length(v_existing, 1) > 1 then
    foreach v_merge in array v_existing loop
      if v_merge <> v_workspace then
        update public.recordsweb_shared_care_patient_threads set workspace_id = v_workspace where workspace_id = v_merge;
        update public.recordsweb_shared_care_messages set workspace_id = v_workspace where workspace_id = v_merge;
        update public.recordsweb_shared_care_workspace_tasks set workspace_id = v_workspace where workspace_id = v_merge;
        update public.recordsweb_shared_care_transfers set workspace_id = v_workspace where workspace_id = v_merge;
        delete from public.recordsweb_shared_care_workspaces where id = v_merge;
      end if;
    end loop;
  end if;

  insert into public.recordsweb_shared_care_workspace_members(workspace_id, organisation_id)
  select v_workspace, unnest(v_component)
  on conflict (workspace_id, organisation_id) do nothing;

  update public.recordsweb_shared_care_workspaces
  set updated_at = now()
  where id = v_workspace;

  return v_workspace;
end;
$$;

create or replace function public.recordsweb_shared_care_ensure_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
begin
  if v_org is null then raise exception 'Unable to determine the current RecordsWeb community.' using errcode='42501'; end if;
  return public.recordsweb_shared_care_ensure_workspace_for_org(v_org);
end;
$$;

create or replace function public.recordsweb_shared_care_sync_workspace_link_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
  v_members uuid[];
  v_component uuid[];
  v_org uuid;
begin
  if new.status = 'active' then
    perform public.recordsweb_shared_care_ensure_workspace_for_org(new.organisation_a_id);
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status <> 'active' then
    select wm.workspace_id into v_workspace
    from public.recordsweb_shared_care_workspace_members wm
    where wm.organisation_id in (new.organisation_a_id,new.organisation_b_id)
    limit 1;

    if v_workspace is not null then
      select array_agg(organisation_id) into v_members
      from public.recordsweb_shared_care_workspace_members where workspace_id=v_workspace;

      if array_length(v_members,1) > 0 then
        with recursive component(org_id) as (
          select v_members[1]
          union
          select case when l.organisation_a_id=c.org_id then l.organisation_b_id else l.organisation_a_id end
          from component c
          join public.recordsweb_shared_care_links l
            on l.status='active' and c.org_id in (l.organisation_a_id,l.organisation_b_id)
        ) select array_agg(distinct org_id) into v_component from component;

        -- Only reset the workspace if the care graph has actually split. This keeps
        -- discussion history intact when another active path still connects everyone.
        if coalesce(array_length(v_component,1),0) < coalesce(array_length(v_members,1),0) then
          delete from public.recordsweb_shared_care_patient_thread_members ptm
          using public.recordsweb_shared_care_patient_threads t
          where ptm.thread_id=t.id and t.workspace_id=v_workspace;
          delete from public.recordsweb_shared_care_workspace_members where workspace_id=v_workspace;
          update public.recordsweb_shared_care_workspaces set name='Archived Shared Care Network', updated_at=now() where id=v_workspace;

          foreach v_org in array v_members loop
            perform public.recordsweb_shared_care_ensure_workspace_for_org(v_org);
          end loop;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists recordsweb_sc_sync_workspace_link on public.recordsweb_shared_care_links;
create trigger recordsweb_sc_sync_workspace_link
after insert or update of status on public.recordsweb_shared_care_links
for each row execute function public.recordsweb_shared_care_sync_workspace_link_trigger();

-- Internal helper: merge every linked copy of the same patient into one patient thread.
create or replace function public.recordsweb_shared_care_ensure_patient_thread_internal(p_patient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_workspace uuid;
  v_patients uuid[];
  v_threads uuid[];
  v_thread uuid;
  v_merge uuid;
begin
  select organisation_id into v_org from public.patients where id = p_patient_id;
  if v_org is null then raise exception 'Patient record not found.'; end if;

  v_workspace := public.recordsweb_shared_care_ensure_workspace_for_org(v_org);
  if v_workspace is null then return null; end if;

  with recursive patient_component(patient_id) as (
    select p_patient_id
    union
    select case when spl.patient_a_id = pc.patient_id then spl.patient_b_id else spl.patient_a_id end
    from patient_component pc
    join public.recordsweb_shared_patient_links spl
      on spl.status = 'active'
     and pc.patient_id in (spl.patient_a_id, spl.patient_b_id)
    join public.recordsweb_shared_care_links l
      on l.id = spl.shared_care_link_id and l.status = 'active'
  )
  select array_agg(distinct patient_id) into v_patients from patient_component;
  if coalesce(array_length(v_patients,1),0) < 2 then return null; end if;

  select array_agg(x.thread_id) into v_threads
  from (
    select ptm.thread_id, min(t.created_at) as created_at
    from public.recordsweb_shared_care_patient_thread_members ptm
    join public.recordsweb_shared_care_patient_threads t on t.id = ptm.thread_id
    where ptm.patient_id = any(v_patients)
    group by ptm.thread_id
    order by min(t.created_at), ptm.thread_id
  ) x;

  v_thread := case when array_length(v_threads, 1) > 0 then v_threads[1] else null end;
  if v_thread is null then
    insert into public.recordsweb_shared_care_patient_threads(workspace_id)
    values (v_workspace) returning id into v_thread;
  else
    update public.recordsweb_shared_care_patient_threads set workspace_id = v_workspace where id = v_thread;
  end if;

  if array_length(v_threads, 1) > 1 then
    foreach v_merge in array v_threads loop
      if v_merge <> v_thread then
        update public.recordsweb_shared_care_messages set patient_thread_id = v_thread where patient_thread_id = v_merge;
        update public.recordsweb_shared_care_workspace_tasks set patient_thread_id = v_thread where patient_thread_id = v_merge;
        update public.recordsweb_shared_care_transfers set patient_thread_id = v_thread where patient_thread_id = v_merge;
        insert into public.recordsweb_shared_care_patient_thread_members(thread_id, organisation_id, patient_id)
          select v_thread, organisation_id, patient_id
          from public.recordsweb_shared_care_patient_thread_members
          where thread_id = v_merge
          on conflict (patient_id) do update
            set thread_id = excluded.thread_id,
                organisation_id = excluded.organisation_id;
        delete from public.recordsweb_shared_care_patient_threads where id = v_merge;
      end if;
    end loop;
  end if;

  insert into public.recordsweb_shared_care_patient_thread_members(thread_id, organisation_id, patient_id)
  select v_thread, p.organisation_id, p.id
  from public.patients p
  where p.id = any(v_patients)
  on conflict do nothing;

  update public.recordsweb_shared_care_patient_threads set updated_at = now() where id = v_thread;
  return v_thread;
end;
$$;

create or replace function public.recordsweb_shared_care_ensure_patient_thread(p_patient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_patient_org uuid;
begin
  select organisation_id into v_patient_org from public.patients where id = p_patient_id;
  if v_org is null or v_patient_org is null or v_org <> v_patient_org then
    raise exception 'The patient must belong to the current RecordsWeb community.' using errcode='42501';
  end if;
  return public.recordsweb_shared_care_ensure_patient_thread_internal(p_patient_id);
end;
$$;

create or replace function public.recordsweb_shared_care_sync_patient_thread_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_patients uuid[];
  v_patient uuid;
begin
  if new.status = 'active' then
    perform public.recordsweb_shared_care_ensure_patient_thread_internal(new.patient_a_id);
  elsif tg_op='UPDATE' and old.status='active' and new.status <> 'active' then
    select thread_id into v_thread
    from public.recordsweb_shared_care_patient_thread_members
    where patient_id in (new.patient_a_id,new.patient_b_id)
    limit 1;
    if v_thread is not null then
      select array_agg(patient_id) into v_patients
      from public.recordsweb_shared_care_patient_thread_members where thread_id=v_thread;
      delete from public.recordsweb_shared_care_patient_thread_members where thread_id=v_thread;
      if array_length(v_patients,1) > 0 then
        foreach v_patient in array v_patients loop
          perform public.recordsweb_shared_care_ensure_patient_thread_internal(v_patient);
        end loop;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists recordsweb_sc_sync_patient_thread on public.recordsweb_shared_patient_links;
create trigger recordsweb_sc_sync_patient_thread
after insert or update of status on public.recordsweb_shared_patient_links
for each row execute function public.recordsweb_shared_care_sync_patient_thread_trigger();


create or replace function public.recordsweb_shared_care_attach_transfer_workspace_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_workspace uuid;
begin
  if new.source_patient_id is not null and (new.workspace_id is null or new.patient_thread_id is null) then
    v_thread := public.recordsweb_shared_care_ensure_patient_thread_internal(new.source_patient_id);
    if v_thread is not null then
      select workspace_id into v_workspace from public.recordsweb_shared_care_patient_threads where id=v_thread;
      new.patient_thread_id := coalesce(new.patient_thread_id, v_thread);
      new.workspace_id := coalesce(new.workspace_id, v_workspace);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists recordsweb_sc_attach_transfer_workspace on public.recordsweb_shared_care_transfers;
create trigger recordsweb_sc_attach_transfer_workspace
before insert or update of source_patient_id on public.recordsweb_shared_care_transfers
for each row execute function public.recordsweb_shared_care_attach_transfer_workspace_trigger();

create or replace function public.recordsweb_shared_care_workspace_is_member(p_workspace_id uuid, p_organisation_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.recordsweb_shared_care_workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.organisation_id = coalesce(p_organisation_id, public.current_organisation_id())
  )
$$;

create or replace function public.recordsweb_shared_care_workspace_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_workspace uuid;
  v_result jsonb;
begin
  if v_org is null then raise exception 'Unable to determine the current RecordsWeb community.' using errcode='42501'; end if;
  v_workspace := public.recordsweb_shared_care_ensure_workspace_for_org(v_org);
  if v_workspace is null then
    return jsonb_build_object('workspace', null, 'members', '[]'::jsonb, 'links', '[]'::jsonb, 'counts', jsonb_build_object('messages',0,'openTasks',0,'handovers',0));
  end if;

  select jsonb_build_object(
    'workspace', jsonb_build_object('id', w.id, 'name', w.name, 'createdAt', w.created_at, 'updatedAt', w.updated_at, 'currentOrganisationId', v_org),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'organisationId', o.id,
        'name', o.name,
        'code', o.org_code,
        'mode', o.system_mode,
        'joinedAt', wm.joined_at,
        'current', o.id = v_org
      ) order by o.name)
      from public.recordsweb_shared_care_workspace_members wm
      join public.organisations o on o.id = wm.organisation_id
      where wm.workspace_id = v_workspace
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linkId', l.id,
        'organisationAId', l.organisation_a_id,
        'organisationBId', l.organisation_b_id,
        'status', l.status,
        'createdAt', l.created_at
      ) order by l.created_at)
      from public.recordsweb_shared_care_links l
      where l.status='active'
        and exists (select 1 from public.recordsweb_shared_care_workspace_members a where a.workspace_id=v_workspace and a.organisation_id=l.organisation_a_id)
        and exists (select 1 from public.recordsweb_shared_care_workspace_members b where b.workspace_id=v_workspace and b.organisation_id=l.organisation_b_id)
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'messages', (select count(*) from public.recordsweb_shared_care_messages m where m.workspace_id=v_workspace),
      'openTasks', (select count(*) from public.recordsweb_shared_care_workspace_tasks t where t.workspace_id=v_workspace and t.status in ('open','accepted')),
      'handovers', (select count(*) from public.recordsweb_shared_care_transfers x where x.workspace_id=v_workspace)
    )
  ) into v_result
  from public.recordsweb_shared_care_workspaces w
  where w.id = v_workspace;

  return v_result;
end;
$$;

create or replace function public.recordsweb_shared_care_patient_workspace(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_patient_org uuid;
  v_thread uuid;
  v_workspace uuid;
begin
  select organisation_id into v_patient_org from public.patients where id=p_patient_id;
  if v_org is null or v_patient_org is null or v_patient_org <> v_org then
    raise exception 'The patient must belong to the current RecordsWeb community.' using errcode='42501';
  end if;

  v_thread := public.recordsweb_shared_care_ensure_patient_thread_internal(p_patient_id);
  if v_thread is null then return null; end if;
  select workspace_id into v_workspace from public.recordsweb_shared_care_patient_threads where id=v_thread;

  return jsonb_build_object(
    'workspaceId', v_workspace,
    'threadId', v_thread,
    'currentOrganisationId', v_org,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'organisationId', o.id,
        'organisationName', o.name,
        'organisationCode', o.org_code,
        'organisationMode', o.system_mode,
        'patientId', p.id,
        'firstName', p.first_name,
        'lastName', p.last_name,
        'dob', p.dob,
        'nhsNumber', p.nhs_number,
        'current', o.id=v_org
      ) order by o.name)
      from public.recordsweb_shared_care_patient_thread_members ptm
      join public.organisations o on o.id=ptm.organisation_id
      join public.patients p on p.id=ptm.patient_id
      where ptm.thread_id=v_thread
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.recordsweb_shared_care_workspace_messages(
  p_workspace_id uuid,
  p_patient_thread_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  workspace_id uuid,
  patient_thread_id uuid,
  message_type text,
  body text,
  reference_type text,
  reference_id text,
  source_organisation_id uuid,
  source_organisation_name text,
  source_organisation_code text,
  source_organisation_mode text,
  author_id uuid,
  author_name text,
  author_role text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.recordsweb_shared_care_workspace_is_member(p_workspace_id) then
    raise exception 'You are not a member of this Shared Care workspace.' using errcode='42501';
  end if;
  if p_patient_thread_id is not null and not exists (
    select 1 from public.recordsweb_shared_care_patient_thread_members ptm
    where ptm.thread_id=p_patient_thread_id and ptm.organisation_id=public.current_organisation_id()
  ) then
    raise exception 'This patient is not linked to your organisation in the Shared Care workspace.' using errcode='42501';
  end if;

  return query
  select m.id, m.workspace_id, m.patient_thread_id, m.message_type, m.body, m.reference_type, m.reference_id,
         m.source_organisation_id, o.name, o.org_code, o.system_mode,
         m.created_by, coalesce(nullif(trim(concat_ws(' ', p.title, p.first_name, p.last_name)), ''), p.display_name, 'RecordsWeb user'),
         coalesce(p.role, ''), m.created_at, m.edited_at
  from public.recordsweb_shared_care_messages m
  join public.organisations o on o.id=m.source_organisation_id
  left join public.profiles p on p.id=m.created_by
  where m.workspace_id=p_workspace_id
    and ((p_patient_thread_id is null and m.patient_thread_id is null) or m.patient_thread_id=p_patient_thread_id)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit,200),1),500);
end;
$$;

create or replace function public.recordsweb_shared_care_post_message(
  p_workspace_id uuid,
  p_patient_thread_id uuid,
  p_body text,
  p_message_type text default 'discussion',
  p_reference_type text default null,
  p_reference_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_id uuid;
  v_body text := trim(coalesce(p_body,''));
begin
  if not public.recordsweb_shared_care_workspace_is_member(p_workspace_id, v_org) then
    raise exception 'You are not a member of this Shared Care workspace.' using errcode='42501';
  end if;
  if v_body = '' then raise exception 'Enter a message.'; end if;
  if length(v_body) > 6000 then raise exception 'Shared Care messages are limited to 6000 characters.'; end if;
  if p_message_type not in ('discussion','clinical_update','request') then raise exception 'Invalid message type.'; end if;
  if p_patient_thread_id is not null and not exists (
    select 1 from public.recordsweb_shared_care_patient_thread_members ptm
    where ptm.thread_id=p_patient_thread_id and ptm.organisation_id=v_org
  ) then raise exception 'This patient is not linked to your organisation in this workspace.' using errcode='42501'; end if;

  insert into public.recordsweb_shared_care_messages(
    workspace_id, patient_thread_id, source_organisation_id, created_by, message_type, body, reference_type, reference_id
  ) values (p_workspace_id, p_patient_thread_id, v_org, auth.uid(), p_message_type, v_body, nullif(trim(coalesce(p_reference_type,'')),''), nullif(trim(coalesce(p_reference_id,'')),''))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.recordsweb_shared_care_workspace_tasks(
  p_workspace_id uuid,
  p_patient_thread_id uuid default null,
  p_include_completed boolean default false
)
returns table (
  id uuid,
  workspace_id uuid,
  patient_thread_id uuid,
  title text,
  details text,
  priority text,
  status text,
  due_at timestamptz,
  source_organisation_id uuid,
  source_organisation_name text,
  target_organisation_id uuid,
  target_organisation_name text,
  local_patient_id uuid,
  created_by uuid,
  created_by_name text,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.recordsweb_shared_care_workspace_is_member(p_workspace_id) then
    raise exception 'You are not a member of this Shared Care workspace.' using errcode='42501';
  end if;

  return query
  select t.id, t.workspace_id, t.patient_thread_id, t.title, t.details, t.priority, t.status, t.due_at,
         t.source_organisation_id, source_org.name,
         t.target_organisation_id, target_org.name,
         (select ptm.patient_id from public.recordsweb_shared_care_patient_thread_members ptm
          where ptm.thread_id=t.patient_thread_id and ptm.organisation_id=public.current_organisation_id() limit 1),
         t.created_by,
         coalesce(nullif(trim(concat_ws(' ', p.title, p.first_name, p.last_name)), ''), p.display_name, 'RecordsWeb user'),
         t.accepted_at, t.completed_at, t.created_at, t.updated_at
  from public.recordsweb_shared_care_workspace_tasks t
  join public.organisations source_org on source_org.id=t.source_organisation_id
  join public.organisations target_org on target_org.id=t.target_organisation_id
  left join public.profiles p on p.id=t.created_by
  where t.workspace_id=p_workspace_id
    and (p_patient_thread_id is null or t.patient_thread_id=p_patient_thread_id)
    and (p_include_completed or t.status not in ('completed','cancelled'))
  order by case t.priority when 'Immediate' then 1 when 'Urgent' then 2 when 'High' then 3 else 4 end,
           t.due_at nulls last, t.created_at desc;
end;
$$;

create or replace function public.recordsweb_shared_care_create_workspace_task(
  p_workspace_id uuid,
  p_patient_thread_id uuid,
  p_target_organisation_id uuid,
  p_title text,
  p_details text default null,
  p_priority text default 'Routine',
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_id uuid;
begin
  if not public.recordsweb_shared_care_workspace_is_member(p_workspace_id, v_org) then
    raise exception 'You are not a member of this Shared Care workspace.' using errcode='42501';
  end if;
  if not public.recordsweb_shared_care_workspace_is_member(p_workspace_id, p_target_organisation_id) then
    raise exception 'The receiving organisation is not a member of this workspace.';
  end if;
  if trim(coalesce(p_title,''))='' then raise exception 'Enter a task title.'; end if;
  if p_priority not in ('Routine','High','Urgent','Immediate') then raise exception 'Invalid priority.'; end if;
  if p_patient_thread_id is not null and not exists (
    select 1 from public.recordsweb_shared_care_patient_thread_members ptm
    where ptm.thread_id=p_patient_thread_id and ptm.organisation_id=v_org
  ) then raise exception 'This patient is not linked to your organisation in this workspace.' using errcode='42501'; end if;
  if p_patient_thread_id is not null and not exists (
    select 1 from public.recordsweb_shared_care_patient_thread_members ptm
    where ptm.thread_id=p_patient_thread_id and ptm.organisation_id=p_target_organisation_id
  ) then raise exception 'The receiving organisation does not have this patient linked in the Shared Care workspace.'; end if;

  insert into public.recordsweb_shared_care_workspace_tasks(
    workspace_id, patient_thread_id, source_organisation_id, target_organisation_id,
    title, details, priority, due_at, created_by
  ) values (
    p_workspace_id, p_patient_thread_id, v_org, p_target_organisation_id,
    trim(p_title), nullif(trim(coalesce(p_details,'')),''), p_priority, p_due_at, auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.recordsweb_shared_care_update_workspace_task(p_task_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_task public.recordsweb_shared_care_workspace_tasks%rowtype;
begin
  select * into v_task from public.recordsweb_shared_care_workspace_tasks where id=p_task_id;
  if v_task.id is null then raise exception 'Shared Care task not found.'; end if;
  if not public.recordsweb_shared_care_workspace_is_member(v_task.workspace_id, v_org) then
    raise exception 'You are not a member of this Shared Care workspace.' using errcode='42501';
  end if;
  if p_status not in ('accepted','completed','cancelled') then raise exception 'Invalid task status.'; end if;
  if p_status in ('accepted','completed') and v_org <> v_task.target_organisation_id then
    raise exception 'Only the receiving organisation can accept or complete this task.' using errcode='42501';
  end if;
  if p_status='cancelled' and v_org <> v_task.source_organisation_id then
    raise exception 'Only the organisation that created this task can cancel it.' using errcode='42501';
  end if;

  update public.recordsweb_shared_care_workspace_tasks
  set status=p_status,
      accepted_at=case when p_status='accepted' then now() else accepted_at end,
      accepted_by=case when p_status='accepted' then auth.uid() else accepted_by end,
      completed_at=case when p_status='completed' then now() else completed_at end,
      completed_by=case when p_status='completed' then auth.uid() else completed_by end
  where id=p_task_id;
  return p_status;
end;
$$;

create or replace function public.recordsweb_shared_care_workspace_transfers(
  p_workspace_id uuid,
  p_patient_thread_id uuid default null
)
returns table (
  id uuid,
  workspace_id uuid,
  patient_thread_id uuid,
  source_organisation_id uuid,
  source_organisation_name text,
  target_organisation_id uuid,
  target_organisation_name text,
  transfer_type text,
  summary text,
  payload jsonb,
  status text,
  created_at timestamptz,
  received_at timestamptz,
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  actioned_at timestamptz,
  local_patient_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.recordsweb_shared_care_workspace_is_member(p_workspace_id) then
    raise exception 'You are not a member of this Shared Care workspace.' using errcode='42501';
  end if;
  return query
  select x.id, x.workspace_id, x.patient_thread_id,
         x.source_organisation_id, so.name, x.target_organisation_id, tr.name,
         x.transfer_type, x.summary, x.payload, x.status, x.created_at,
         x.received_at, x.viewed_at, x.acknowledged_at, x.actioned_at,
         (select ptm.patient_id from public.recordsweb_shared_care_patient_thread_members ptm
          where ptm.thread_id=x.patient_thread_id and ptm.organisation_id=public.current_organisation_id() limit 1)
  from public.recordsweb_shared_care_transfers x
  join public.organisations so on so.id=x.source_organisation_id
  join public.organisations tr on tr.id=x.target_organisation_id
  where x.workspace_id=p_workspace_id
    and (p_patient_thread_id is null or x.patient_thread_id=p_patient_thread_id)
  order by x.created_at desc;
end;
$$;



create or replace function public.recordsweb_shared_care_update_transfer_status(p_transfer_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_row public.recordsweb_shared_care_transfers%rowtype;
begin
  select * into v_row from public.recordsweb_shared_care_transfers where id=p_transfer_id;
  if v_row.id is null then raise exception 'Transfer record not found.'; end if;
  if v_org is null or v_org not in (v_row.source_organisation_id, v_row.target_organisation_id) then
    raise exception 'Only participating organisations can update this transfer.' using errcode='42501';
  end if;
  if p_status not in ('received','viewed','acknowledged','actioned') then raise exception 'Invalid transfer status.'; end if;
  if p_status in ('received','viewed','acknowledged','actioned') and v_org <> v_row.target_organisation_id then
    raise exception 'Only the receiving organisation can acknowledge or action this transfer.' using errcode='42501';
  end if;

  update public.recordsweb_shared_care_transfers
  set status=p_status,
      received_at=case when p_status in ('received','viewed','acknowledged','actioned') then coalesce(received_at, now()) else received_at end,
      viewed_at=case when p_status in ('viewed','acknowledged','actioned') then coalesce(viewed_at, now()) else viewed_at end,
      acknowledged_at=case when p_status in ('acknowledged','actioned') then coalesce(acknowledged_at, now()) else acknowledged_at end,
      acknowledged_by=case when p_status in ('acknowledged','actioned') then coalesce(acknowledged_by, auth.uid()) else acknowledged_by end,
      actioned_at=case when p_status='actioned' then coalesce(actioned_at, now()) else actioned_at end,
      updated_at=now()
  where id=p_transfer_id;
  return p_status;
end;
$$;


-- Tighten the 3.5 transfer table now that workspace metadata is attached to it.
drop policy if exists recordsweb_shared_care_transfers_insert on public.recordsweb_shared_care_transfers;
create policy recordsweb_shared_care_transfers_insert on public.recordsweb_shared_care_transfers
for insert to authenticated with check (
  source_organisation_id = public.current_organisation_id()
  and source_organisation_id <> target_organisation_id
  and exists (
    select 1 from public.recordsweb_shared_care_links l
    join public.recordsweb_shared_patient_links spl on spl.shared_care_link_id=l.id
    where spl.id=shared_patient_link_id
      and spl.status='active'
      and l.status='active'
      and source_organisation_id in (l.organisation_a_id,l.organisation_b_id)
      and target_organisation_id in (l.organisation_a_id,l.organisation_b_id)
  )
  and (workspace_id is null or (
    public.recordsweb_shared_care_workspace_is_member(workspace_id, source_organisation_id)
    and public.recordsweb_shared_care_workspace_is_member(workspace_id, target_organisation_id)
  ))
  and (patient_thread_id is null or (
    exists (select 1 from public.recordsweb_shared_care_patient_thread_members ptm where ptm.thread_id=patient_thread_id and ptm.organisation_id=source_organisation_id and ptm.patient_id=source_patient_id)
    and (target_patient_id is null or exists (select 1 from public.recordsweb_shared_care_patient_thread_members ptm where ptm.thread_id=patient_thread_id and ptm.organisation_id=target_organisation_id and ptm.patient_id=target_patient_id))
  ))
);

drop policy if exists recordsweb_shared_care_transfers_update on public.recordsweb_shared_care_transfers;
revoke update on public.recordsweb_shared_care_transfers from authenticated;

-- Internal graph helpers are not client RPCs.
revoke all on function public.recordsweb_shared_care_ensure_workspace_for_org(uuid) from public, anon, authenticated;
revoke all on function public.recordsweb_shared_care_sync_workspace_link_trigger() from public, anon, authenticated;
revoke all on function public.recordsweb_shared_care_ensure_patient_thread_internal(uuid) from public, anon, authenticated;
revoke all on function public.recordsweb_shared_care_sync_patient_thread_trigger() from public, anon, authenticated;
revoke all on function public.recordsweb_shared_care_attach_transfer_workspace_trigger() from public, anon, authenticated;

revoke all on function public.recordsweb_shared_care_workspace_is_member(uuid,uuid) from public, anon, authenticated;
grant execute on function public.recordsweb_shared_care_workspace_is_member(uuid,uuid) to authenticated;

-- RLS protects direct table access; enriched reads and graph resolution use the security-definer RPCs above.
alter table public.recordsweb_shared_care_workspaces enable row level security;
alter table public.recordsweb_shared_care_workspace_members enable row level security;
alter table public.recordsweb_shared_care_patient_threads enable row level security;
alter table public.recordsweb_shared_care_patient_thread_members enable row level security;
alter table public.recordsweb_shared_care_messages enable row level security;
alter table public.recordsweb_shared_care_workspace_tasks enable row level security;

drop policy if exists recordsweb_sc_workspaces_read on public.recordsweb_shared_care_workspaces;
create policy recordsweb_sc_workspaces_read on public.recordsweb_shared_care_workspaces
for select to authenticated using (public.recordsweb_shared_care_workspace_is_member(id));

drop policy if exists recordsweb_sc_workspace_members_read on public.recordsweb_shared_care_workspace_members;
create policy recordsweb_sc_workspace_members_read on public.recordsweb_shared_care_workspace_members
for select to authenticated using (public.recordsweb_shared_care_workspace_is_member(workspace_id));

drop policy if exists recordsweb_sc_patient_threads_read on public.recordsweb_shared_care_patient_threads;
create policy recordsweb_sc_patient_threads_read on public.recordsweb_shared_care_patient_threads
for select to authenticated using (public.recordsweb_shared_care_workspace_is_member(workspace_id));

drop policy if exists recordsweb_sc_patient_thread_members_read on public.recordsweb_shared_care_patient_thread_members;
create policy recordsweb_sc_patient_thread_members_read on public.recordsweb_shared_care_patient_thread_members
for select to authenticated using (
  exists (select 1 from public.recordsweb_shared_care_patient_threads t where t.id=thread_id and public.recordsweb_shared_care_workspace_is_member(t.workspace_id))
);

drop policy if exists recordsweb_sc_messages_read on public.recordsweb_shared_care_messages;
create policy recordsweb_sc_messages_read on public.recordsweb_shared_care_messages
for select to authenticated using (public.recordsweb_shared_care_workspace_is_member(workspace_id));

drop policy if exists recordsweb_sc_messages_insert on public.recordsweb_shared_care_messages;
create policy recordsweb_sc_messages_insert on public.recordsweb_shared_care_messages
for insert to authenticated with check (
  source_organisation_id=public.current_organisation_id()
  and created_by=auth.uid()
  and public.recordsweb_shared_care_workspace_is_member(workspace_id)
);

drop policy if exists recordsweb_sc_tasks_read on public.recordsweb_shared_care_workspace_tasks;
create policy recordsweb_sc_tasks_read on public.recordsweb_shared_care_workspace_tasks
for select to authenticated using (public.recordsweb_shared_care_workspace_is_member(workspace_id));

drop policy if exists recordsweb_sc_tasks_insert on public.recordsweb_shared_care_workspace_tasks;
create policy recordsweb_sc_tasks_insert on public.recordsweb_shared_care_workspace_tasks
for insert to authenticated with check (
  source_organisation_id=public.current_organisation_id()
  and created_by=auth.uid()
  and public.recordsweb_shared_care_workspace_is_member(workspace_id)
  and public.recordsweb_shared_care_workspace_is_member(workspace_id, target_organisation_id)
);

drop policy if exists recordsweb_sc_tasks_update on public.recordsweb_shared_care_workspace_tasks;
create policy recordsweb_sc_tasks_update on public.recordsweb_shared_care_workspace_tasks
for update to authenticated using (public.recordsweb_shared_care_workspace_is_member(workspace_id))
with check (public.recordsweb_shared_care_workspace_is_member(workspace_id));

grant select on public.recordsweb_shared_care_workspaces to authenticated;
grant select on public.recordsweb_shared_care_workspace_members to authenticated;
grant select on public.recordsweb_shared_care_patient_threads to authenticated;
grant select on public.recordsweb_shared_care_patient_thread_members to authenticated;
revoke insert, update, delete on public.recordsweb_shared_care_messages from authenticated;
grant select on public.recordsweb_shared_care_messages to authenticated;
revoke insert, update, delete on public.recordsweb_shared_care_workspace_tasks from authenticated;
grant select on public.recordsweb_shared_care_workspace_tasks to authenticated;

revoke all on function public.recordsweb_shared_care_ensure_workspace() from public, anon;
revoke all on function public.recordsweb_shared_care_workspace_overview() from public, anon;
revoke all on function public.recordsweb_shared_care_ensure_patient_thread(uuid) from public, anon;
revoke all on function public.recordsweb_shared_care_patient_workspace(uuid) from public, anon;
revoke all on function public.recordsweb_shared_care_workspace_messages(uuid,uuid,integer) from public, anon;
revoke all on function public.recordsweb_shared_care_post_message(uuid,uuid,text,text,text,text) from public, anon;
revoke all on function public.recordsweb_shared_care_workspace_tasks(uuid,uuid,boolean) from public, anon;
revoke all on function public.recordsweb_shared_care_create_workspace_task(uuid,uuid,uuid,text,text,text,timestamptz) from public, anon;
revoke all on function public.recordsweb_shared_care_update_workspace_task(uuid,text) from public, anon;
revoke all on function public.recordsweb_shared_care_workspace_transfers(uuid,uuid) from public, anon;
revoke all on function public.recordsweb_shared_care_update_transfer_status(uuid,text) from public, anon;

grant execute on function public.recordsweb_shared_care_ensure_workspace() to authenticated;
grant execute on function public.recordsweb_shared_care_workspace_overview() to authenticated;
grant execute on function public.recordsweb_shared_care_ensure_patient_thread(uuid) to authenticated;
grant execute on function public.recordsweb_shared_care_patient_workspace(uuid) to authenticated;
grant execute on function public.recordsweb_shared_care_workspace_messages(uuid,uuid,integer) to authenticated;
grant execute on function public.recordsweb_shared_care_post_message(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.recordsweb_shared_care_workspace_tasks(uuid,uuid,boolean) to authenticated;
grant execute on function public.recordsweb_shared_care_create_workspace_task(uuid,uuid,uuid,text,text,text,timestamptz) to authenticated;
grant execute on function public.recordsweb_shared_care_update_workspace_task(uuid,text) to authenticated;
grant execute on function public.recordsweb_shared_care_workspace_transfers(uuid,uuid) to authenticated;
grant execute on function public.recordsweb_shared_care_update_transfer_status(uuid,text) to authenticated;

-- Build workspace membership for any relationships that were already active before 3.6.0.
do $$
declare r record;
begin
  for r in select distinct organisation_a_id as organisation_id from public.recordsweb_shared_care_links where status='active' loop
    perform public.recordsweb_shared_care_ensure_workspace_for_org(r.organisation_id);
  end loop;
  for r in select patient_a_id as patient_id from public.recordsweb_shared_patient_links where status='active' loop
    perform public.recordsweb_shared_care_ensure_patient_thread_internal(r.patient_id);
  end loop;
end $$;

-- Backfill workspace/thread ids for existing 3.5 transfer-of-care rows when a matching patient thread exists.
update public.recordsweb_shared_care_transfers x
set patient_thread_id = ptm.thread_id,
    workspace_id = t.workspace_id
from public.recordsweb_shared_care_patient_thread_members ptm
join public.recordsweb_shared_care_patient_threads t on t.id=ptm.thread_id
where x.patient_thread_id is null
  and ptm.patient_id = x.source_patient_id;

commit;
