-- RecordsWeb 3.5.0
-- Care-specific workspaces + Shared Care 2.0 transfer-of-care workflow

begin;

create table if not exists public.recordsweb_care_episodes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  care_mode text not null check (care_mode in ('hospital','ambulance')),
  episode_type text not null,
  reference text not null,
  status text not null,
  priority text,
  presenting_complaint text,
  location text,
  ward text,
  bed text,
  unit_call_sign text,
  destination text,
  eta_minutes integer,
  assigned_clinician text,
  observations jsonb not null default '[]'::jsonb,
  treatments jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, reference)
);

create index if not exists recordsweb_care_episodes_org_mode_idx on public.recordsweb_care_episodes(organisation_id, care_mode, status);
create index if not exists recordsweb_care_episodes_patient_idx on public.recordsweb_care_episodes(patient_id);

create table if not exists public.recordsweb_care_work_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  related_episode_id uuid references public.recordsweb_care_episodes(id) on delete set null,
  care_mode text not null check (care_mode in ('general_practice','hospital','ambulance')),
  category text not null default 'Task',
  title text not null,
  priority text not null default 'Routine',
  status text not null default 'open' check (status in ('open','in_progress','completed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recordsweb_care_work_items_org_mode_idx on public.recordsweb_care_work_items(organisation_id, care_mode, status);
create index if not exists recordsweb_care_work_items_due_idx on public.recordsweb_care_work_items(due_at);

create table if not exists public.recordsweb_shared_care_transfers (
  id uuid primary key default gen_random_uuid(),
  shared_patient_link_id uuid references public.recordsweb_shared_patient_links(id) on delete set null,
  source_organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  target_organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_patient_id uuid not null references public.patients(id) on delete cascade,
  target_patient_id uuid references public.patients(id) on delete set null,
  transfer_type text not null default 'clinical_update' check (transfer_type in ('clinical_update','ambulance_handover','hospital_discharge','care_plan_update')),
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'sent' check (status in ('sent','received','viewed','actioned')),
  created_by uuid default auth.uid(),
  received_at timestamptz,
  viewed_at timestamptz,
  actioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recordsweb_shared_care_transfers_source_idx on public.recordsweb_shared_care_transfers(source_organisation_id, source_patient_id, created_at desc);
create index if not exists recordsweb_shared_care_transfers_target_idx on public.recordsweb_shared_care_transfers(target_organisation_id, target_patient_id, created_at desc);

create or replace function public.recordsweb_350_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

DROP TRIGGER IF EXISTS recordsweb_care_episodes_touch_updated_at ON public.recordsweb_care_episodes;
create trigger recordsweb_care_episodes_touch_updated_at before update on public.recordsweb_care_episodes for each row execute function public.recordsweb_350_touch_updated_at();
DROP TRIGGER IF EXISTS recordsweb_care_work_items_touch_updated_at ON public.recordsweb_care_work_items;
create trigger recordsweb_care_work_items_touch_updated_at before update on public.recordsweb_care_work_items for each row execute function public.recordsweb_350_touch_updated_at();
DROP TRIGGER IF EXISTS recordsweb_shared_care_transfers_touch_updated_at ON public.recordsweb_shared_care_transfers;
create trigger recordsweb_shared_care_transfers_touch_updated_at before update on public.recordsweb_shared_care_transfers for each row execute function public.recordsweb_350_touch_updated_at();

alter table public.recordsweb_care_episodes enable row level security;
alter table public.recordsweb_care_work_items enable row level security;
alter table public.recordsweb_shared_care_transfers enable row level security;

DROP POLICY IF EXISTS recordsweb_care_episodes_read ON public.recordsweb_care_episodes;
create policy recordsweb_care_episodes_read on public.recordsweb_care_episodes for select to authenticated using (organisation_id = public.current_organisation_id());
DROP POLICY IF EXISTS recordsweb_care_episodes_insert ON public.recordsweb_care_episodes;
create policy recordsweb_care_episodes_insert on public.recordsweb_care_episodes for insert to authenticated with check (organisation_id = public.current_organisation_id());
DROP POLICY IF EXISTS recordsweb_care_episodes_update ON public.recordsweb_care_episodes;
create policy recordsweb_care_episodes_update on public.recordsweb_care_episodes for update to authenticated using (organisation_id = public.current_organisation_id()) with check (organisation_id = public.current_organisation_id());

DROP POLICY IF EXISTS recordsweb_care_work_items_read ON public.recordsweb_care_work_items;
create policy recordsweb_care_work_items_read on public.recordsweb_care_work_items for select to authenticated using (organisation_id = public.current_organisation_id());
DROP POLICY IF EXISTS recordsweb_care_work_items_insert ON public.recordsweb_care_work_items;
create policy recordsweb_care_work_items_insert on public.recordsweb_care_work_items for insert to authenticated with check (organisation_id = public.current_organisation_id());
DROP POLICY IF EXISTS recordsweb_care_work_items_update ON public.recordsweb_care_work_items;
create policy recordsweb_care_work_items_update on public.recordsweb_care_work_items for update to authenticated using (organisation_id = public.current_organisation_id()) with check (organisation_id = public.current_organisation_id());

DROP POLICY IF EXISTS recordsweb_shared_care_transfers_read ON public.recordsweb_shared_care_transfers;
create policy recordsweb_shared_care_transfers_read on public.recordsweb_shared_care_transfers for select to authenticated using (public.current_organisation_id() in (source_organisation_id, target_organisation_id));
DROP POLICY IF EXISTS recordsweb_shared_care_transfers_insert ON public.recordsweb_shared_care_transfers;
create policy recordsweb_shared_care_transfers_insert on public.recordsweb_shared_care_transfers for insert to authenticated with check (
  source_organisation_id = public.current_organisation_id()
  and source_organisation_id <> target_organisation_id
  and exists (
    select 1 from public.recordsweb_shared_care_links l
    where l.id = (
      select spl.shared_care_link_id from public.recordsweb_shared_patient_links spl where spl.id = shared_patient_link_id
    )
    and l.status = 'active'
    and source_organisation_id in (l.organisation_a_id, l.organisation_b_id)
    and target_organisation_id in (l.organisation_a_id, l.organisation_b_id)
  )
);
DROP POLICY IF EXISTS recordsweb_shared_care_transfers_update ON public.recordsweb_shared_care_transfers;
create policy recordsweb_shared_care_transfers_update on public.recordsweb_shared_care_transfers for update to authenticated using (public.current_organisation_id() in (source_organisation_id, target_organisation_id)) with check (public.current_organisation_id() in (source_organisation_id, target_organisation_id));

grant select, insert, update on public.recordsweb_care_episodes to authenticated;
grant select, insert, update on public.recordsweb_care_work_items to authenticated;
grant select, insert, update on public.recordsweb_shared_care_transfers to authenticated;

commit;
