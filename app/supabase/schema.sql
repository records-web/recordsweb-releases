-- RecordsWeb - Grove Way Health Centre
-- Run this in a NEW Supabase project using the SQL Editor.
-- The desktop app uses only the anon/publishable key. Never put the service-role
-- key in the Electron renderer. Account creation is performed by the supplied
-- Supabase Edge Function in supabase/functions/recordsweb-admin.

create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  org_code text unique not null,
  name text not null,
  primary_color text not null default '#0f6fbd',
  navigation_color text not null default '#cfe7f8',
  patient_banner_color text not null default '#753b0d',
  logo_data_url text,
  logo_path text,
  logo_file_name text,
  logo_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  username text not null,
  title text,
  first_name text,
  last_name text,
  display_name text not null,
  role text not null default 'Patient Coordinator',
  roles text[] not null default array['Patient Coordinator']::text[],
  is_management boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, username)
);


-- RecordsWeb 1.6 management/branding migration for existing projects.
-- RecordsWeb 1.7 removes the Workflow/Population Reporting UI and adds Staff Area tables.
-- RecordsWeb 1.8 adds collaborative Organisation Notepad entries and management-controlled News.
-- RecordsWeb 2.2 stores branding logos in Supabase Storage and adds patient-record realtime change alerts.
-- Existing workflow_tasks tables may be left in place; RecordsWeb no longer reads or writes them.
alter table public.organisations add column if not exists primary_color text not null default '#0f6fbd';
alter table public.organisations add column if not exists navigation_color text not null default '#cfe7f8';
alter table public.organisations add column if not exists patient_banner_color text not null default '#753b0d';
alter table public.organisations add column if not exists logo_data_url text;
alter table public.organisations add column if not exists logo_path text;
alter table public.organisations add column if not exists logo_file_name text;
alter table public.organisations add column if not exists logo_updated_at timestamptz;
alter table public.profiles add column if not exists title text;
alter table public.profiles add column if not exists roles text[] not null default '{}'::text[];
update public.profiles set roles = array[role] where cardinality(roles) = 0;

-- RecordsWeb 2.0 staff-role restrictions. Existing unsupported roles are mapped
-- to Patient Coordinator before constraints are applied.
alter table public.profiles alter column role set default 'Patient Coordinator';
alter table public.profiles alter column roles set default array['Patient Coordinator']::text[];
update public.profiles
set role = 'Patient Coordinator', roles = array['Patient Coordinator']
where role not in (
  'GP Partner','Practice Manager','Assistant Manager','General Practitioner',
  'GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse',
  'Advanced Clinical Practitioner','General Practice Nurse','Nurse Associate',
  'Healthcare Assistant','Patient Coordinator'
);
update public.profiles
set roles = array(
  select distinct r from unnest(roles) as r
  where r in (
    'GP Partner','Practice Manager','Assistant Manager','General Practitioner',
    'GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse',
    'Advanced Clinical Practitioner','General Practice Nurse','Nurse Associate',
    'Healthcare Assistant','Patient Coordinator'
  )
)
where exists (select 1 from unnest(roles) r where r not in (
  'GP Partner','Practice Manager','Assistant Manager','General Practitioner',
  'GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse',
  'Advanced Clinical Practitioner','General Practice Nurse','Nurse Associate',
  'Healthcare Assistant','Patient Coordinator'
));
update public.profiles set roles = array['Patient Coordinator'], role = 'Patient Coordinator' where cardinality(roles) = 0;
update public.profiles set role = roles[1] where not (role = any(roles));

do $$ begin
  alter table public.profiles add constraint profiles_role_allowed check (role in (
    'GP Partner','Practice Manager','Assistant Manager','General Practitioner',
    'GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse',
    'Advanced Clinical Practitioner','General Practice Nurse','Nurse Associate',
    'Healthcare Assistant','Patient Coordinator'
  ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_roles_allowed check (
    cardinality(roles) >= 1 and
    roles <@ array[
      'GP Partner','Practice Manager','Assistant Manager','General Practitioner',
      'GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse',
      'Advanced Clinical Practitioner','General Practice Nurse','Nurse Associate',
      'Healthcare Assistant','Patient Coordinator'
    ]::text[] and role = any(roles)
  );
exception when duplicate_object then null; end $$;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  title text,
  first_name text not null,
  last_name text not null,
  dob date not null,
  sex text,
  gender text,
  emis_number text,
  nhs_number text,
  usual_gp text,
  status text not null default 'Active',
  address text,
  phone text,
  mobile text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists patients_org_name_idx on public.patients (organisation_id, last_name, first_name);
create index if not exists patients_nhs_idx on public.patients (nhs_number);
create unique index if not exists patients_org_nhs_unique_idx on public.patients (organisation_id, nhs_number) where nhs_number is not null;

create table if not exists public.problems (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null,
  onset_date date,
  end_date date,
  status text not null default 'Active',
  significance text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null,
  dose text,
  quantity text,
  type text not null default 'Acute Meds',
  last_issue_date date,
  authoriser text,
  issues text,
  method text,
  usage text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RecordsWeb 2.0 medication groups.
alter table public.medications alter column type set default 'Acute Meds';
update public.medications set type = 'Acute Meds' where type = 'Acute';
update public.medications set type = 'Long Term Meds' where type = 'Repeat dispensing';
update public.medications set type = 'Acute Meds' where type not in ('Acute Meds','Repeat','Long Term Meds');
do $$ begin
  alter table public.medications add constraint medications_type_allowed check (type in ('Acute Meds','Repeat','Long Term Meds'));
exception when duplicate_object then null; end $$;

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  date timestamptz not null default now(),
  clinician text not null,
  location text,
  type text,
  status text not null default 'Complete',
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.diary_tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  title text not null,
  due_date date,
  priority text default 'Normal',
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  title text not null,
  category text,
  date date default current_date,
  author text,
  storage_path text,
  created_at timestamptz not null default now()
);
alter table public.documents add column if not exists document_type text not null default 'General';
alter table public.documents add column if not exists status text not null default 'Filed';
alter table public.documents add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.documents add column if not exists immutable boolean not null default false;
alter table public.documents add column if not exists locked_at timestamptz;
alter table public.documents add column if not exists locked_by uuid references public.profiles(id) on delete set null;

create table if not exists public.investigations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null,
  result text,
  date date default current_date,
  status text,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  service text not null,
  date date default current_date,
  status text default 'Waiting',
  priority text default 'Routine',
  notes text,
  created_at timestamptz not null default now()
);


-- RecordsWeb 2.2 patient record change feed. Clinical-table triggers append to
-- this table so other open RecordsWeb clients can warn staff that their copy of
-- a patient's record is stale without forcing a full Electron reload.
create table if not exists public.patient_record_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_username text,
  actor_role text,
  source_table text not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists patient_record_events_patient_created_idx
  on public.patient_record_events (patient_id, created_at desc);
create index if not exists patient_record_events_org_created_idx
  on public.patient_record_events (organisation_id, created_at desc);


create table if not exists public.staff_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  subject text not null,
  category text not null default 'General',
  urgency text not null default 'Normal',
  status text not null default 'Open',
  description text,
  reporter_name text,
  reporter_username text,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  title text not null,
  department text,
  employment_type text,
  location text,
  closing_date date,
  status text not null default 'Open',
  description text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_notices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  title text not null,
  body text,
  priority text not null default 'Normal',
  published_at date not null default current_date,
  expires_at date,
  active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.organisation_notepad (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  title text not null,
  body text not null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_by_name text,
  created_by_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organisation_news (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  title text not null,
  body text not null,
  category text not null default 'News',
  published_at date not null default current_date,
  expires_at date,
  active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes integer not null default 10 check (duration_minutes > 0),
  clinician text not null,
  appointment_type text not null default 'GP appointment',
  status text not null default 'Booked',
  wait_started_at timestamptz,
  room text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointments_org_starts_idx on public.appointments (organisation_id, starts_at);
create index if not exists staff_reports_org_created_idx on public.staff_reports (organisation_id, created_at desc);
create index if not exists staff_jobs_org_created_idx on public.staff_jobs (organisation_id, created_at desc);
create index if not exists staff_notices_org_published_idx on public.staff_notices (organisation_id, published_at desc);
create index if not exists organisation_notepad_org_updated_idx on public.organisation_notepad (organisation_id, updated_at desc);
create index if not exists organisation_news_org_published_idx on public.organisation_news (organisation_id, published_at desc);

insert into public.organisations (org_code, name)
values ('GW.HC', 'Grove Way Health Centre')
on conflict (org_code) do update set name = excluded.name;

create or replace function public.current_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organisation_id from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.current_user_is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_management and active from public.profiles where id = auth.uid()), false)
$$;


-- Record who changed a patient's clinical record. The actor information is
-- copied into the event at write time so the warning remains readable even if
-- that staff member's profile is later edited.
create or replace function public.recordsweb_log_patient_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id uuid;
  v_organisation_id uuid;
  v_actor_id uuid;
  v_actor_username text;
  v_actor_role text;
begin
  if tg_table_name = 'patients' then
    if tg_op = 'DELETE' then
      v_patient_id := old.id;
      v_organisation_id := old.organisation_id;
    else
      v_patient_id := new.id;
      v_organisation_id := new.organisation_id;
    end if;
  else
    if tg_op = 'DELETE' then
      v_patient_id := old.patient_id;
    else
      v_patient_id := new.patient_id;
    end if;
    select organisation_id into v_organisation_id
    from public.patients
    where id = v_patient_id;
  end if;

  v_actor_id := auth.uid();
  if v_patient_id is not null and v_organisation_id is not null and v_actor_id is not null then
    select username, role
      into v_actor_username, v_actor_role
    from public.profiles
    where id = v_actor_id;

    insert into public.patient_record_events (
      organisation_id,
      patient_id,
      actor_id,
      actor_username,
      actor_role,
      source_table,
      action
    ) values (
      v_organisation_id,
      v_patient_id,
      v_actor_id,
      coalesce(v_actor_username, 'Unknown user'),
      coalesce(v_actor_role, 'Staff member'),
      tg_table_name,
      tg_op
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Track all patient-record sections currently exposed by RecordsWeb.
do $$
declare
  t text;
begin
  foreach t in array array[
    'patients','problems','medications','consultations','diary_tasks',
    'documents','investigations','referrals'
  ] loop
    execute format('drop trigger if exists recordsweb_patient_change on public.%I', t);
    if t = 'patients' then
      execute format(
        'create trigger recordsweb_patient_change after insert or update on public.%I for each row execute function public.recordsweb_log_patient_record_change()',
        t
      );
    else
      execute format(
        'create trigger recordsweb_patient_change after insert or update or delete on public.%I for each row execute function public.recordsweb_log_patient_record_change()',
        t
      );
    end if;
  end loop;
end $$;

-- RecordsWeb 2.2 branding storage. The bucket is public so the Grove Way logo can
-- render on the sign-in screen before a staff member authenticates. Upload,
-- replacement and deletion remain management-only through Storage RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordsweb-branding',
  'recordsweb-branding',
  true,
  1048576,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recordsweb_branding_management_insert" on storage.objects;
drop policy if exists "recordsweb_branding_management_update" on storage.objects;
drop policy if exists "recordsweb_branding_management_delete" on storage.objects;
create policy "recordsweb_branding_management_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = 'grove-way-health-centre'
);
create policy "recordsweb_branding_management_update" on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = 'grove-way-health-centre'
)
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = 'grove-way-health-centre'
);
create policy "recordsweb_branding_management_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = 'grove-way-health-centre'
);

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.problems enable row level security;
alter table public.medications enable row level security;
alter table public.consultations enable row level security;
alter table public.diary_tasks enable row level security;
alter table public.documents enable row level security;
alter table public.investigations enable row level security;
alter table public.referrals enable row level security;
alter table public.patient_record_events enable row level security;
alter table public.staff_reports enable row level security;
alter table public.staff_jobs enable row level security;
alter table public.staff_notices enable row level security;
alter table public.organisation_notepad enable row level security;
alter table public.organisation_news enable row level security;
alter table public.appointments enable row level security;

-- Re-runnable policy setup.
drop policy if exists "organisation_read" on public.organisations;
create policy "organisation_read" on public.organisations for select
using (org_code = 'GW.HC' or id = public.current_organisation_id());

drop policy if exists "organisation_management_update" on public.organisations;
create policy "organisation_management_update" on public.organisations for update
using (id = public.current_organisation_id() and public.current_user_is_management())
with check (id = public.current_organisation_id() and public.current_user_is_management());

drop policy if exists "profile_read" on public.profiles;
create policy "profile_read" on public.profiles for select
using (
  id = auth.uid()
  or (
    organisation_id = public.current_organisation_id()
    and (active = true or public.current_user_is_management())
  )
);

drop policy if exists "patients_read" on public.patients;
drop policy if exists "patients_insert" on public.patients;
drop policy if exists "patients_update" on public.patients;
create policy "patients_read" on public.patients for select using (organisation_id = public.current_organisation_id());
create policy "patients_insert" on public.patients for insert with check (organisation_id = public.current_organisation_id());
create policy "patients_update" on public.patients for update using (organisation_id = public.current_organisation_id()) with check (organisation_id = public.current_organisation_id());

-- Patient child tables. Read access is organisation-wide, so all active Grove Way staff
-- can see the patient's previous consultations regardless of which clinician recorded them.
do $$
declare t text;
begin
  foreach t in array array['problems','medications','consultations','diary_tasks','documents','investigations','referrals'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for select using (exists (select 1 from public.patients p where p.id = patient_id and p.organisation_id = public.current_organisation_id()))', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (exists (select 1 from public.patients p where p.id = patient_id and p.organisation_id = public.current_organisation_id()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (exists (select 1 from public.patients p where p.id = patient_id and p.organisation_id = public.current_organisation_id())) with check (exists (select 1 from public.patients p where p.id = patient_id and p.organisation_id = public.current_organisation_id()))', t || '_update', t);
  end loop;
end $$;

-- Realtime change-feed rows are visible only to active staff in the same
-- organisation. Clients never insert these rows directly; the security-definer
-- trigger above is the only writer.
drop policy if exists "patient_record_events_read" on public.patient_record_events;
create policy "patient_record_events_read" on public.patient_record_events for select
using (organisation_id = public.current_organisation_id());

-- Supabase Realtime only broadcasts Postgres changes for tables in the
-- supabase_realtime publication. Keep this migration safe to re-run.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'patient_record_events'
  ) then
    alter publication supabase_realtime add table public.patient_record_events;
  end if;
end $$;


-- Staff Area. Staff can see their own reports; management can see all reports.
drop policy if exists "staff_reports_read" on public.staff_reports;
drop policy if exists "staff_reports_insert" on public.staff_reports;
drop policy if exists "staff_reports_update" on public.staff_reports;
create policy "staff_reports_read" on public.staff_reports for select
using (organisation_id = public.current_organisation_id() and (created_by = auth.uid() or public.current_user_is_management()));
create policy "staff_reports_insert" on public.staff_reports for insert
with check (organisation_id = public.current_organisation_id() and created_by = auth.uid());
create policy "staff_reports_update" on public.staff_reports for update
using (organisation_id = public.current_organisation_id() and (created_by = auth.uid() or public.current_user_is_management()))
with check (organisation_id = public.current_organisation_id() and (created_by = auth.uid() or public.current_user_is_management()));

-- Jobs and notices are visible to all staff but managed by management accounts.
drop policy if exists "staff_jobs_read" on public.staff_jobs;
drop policy if exists "staff_jobs_insert" on public.staff_jobs;
drop policy if exists "staff_jobs_update" on public.staff_jobs;
create policy "staff_jobs_read" on public.staff_jobs for select using (organisation_id = public.current_organisation_id());
create policy "staff_jobs_insert" on public.staff_jobs for insert with check (organisation_id = public.current_organisation_id() and public.current_user_is_management());
create policy "staff_jobs_update" on public.staff_jobs for update using (organisation_id = public.current_organisation_id() and public.current_user_is_management()) with check (organisation_id = public.current_organisation_id() and public.current_user_is_management());

drop policy if exists "staff_notices_read" on public.staff_notices;
drop policy if exists "staff_notices_insert" on public.staff_notices;
drop policy if exists "staff_notices_update" on public.staff_notices;
create policy "staff_notices_read" on public.staff_notices for select using (organisation_id = public.current_organisation_id());
create policy "staff_notices_insert" on public.staff_notices for insert with check (organisation_id = public.current_organisation_id() and public.current_user_is_management());
create policy "staff_notices_update" on public.staff_notices for update using (organisation_id = public.current_organisation_id() and public.current_user_is_management()) with check (organisation_id = public.current_organisation_id() and public.current_user_is_management());


-- Home page organisation notepad. All active staff can read and add entries.
-- Authors may maintain their own entries; management may maintain every entry.
drop policy if exists "organisation_notepad_read" on public.organisation_notepad;
drop policy if exists "organisation_notepad_insert" on public.organisation_notepad;
drop policy if exists "organisation_notepad_update" on public.organisation_notepad;
drop policy if exists "organisation_notepad_delete" on public.organisation_notepad;
create policy "organisation_notepad_read" on public.organisation_notepad for select
using (organisation_id = public.current_organisation_id());
create policy "organisation_notepad_insert" on public.organisation_notepad for insert
with check (organisation_id = public.current_organisation_id() and created_by = auth.uid());
create policy "organisation_notepad_update" on public.organisation_notepad for update
using (organisation_id = public.current_organisation_id() and (created_by = auth.uid() or public.current_user_is_management()))
with check (organisation_id = public.current_organisation_id() and (created_by = auth.uid() or public.current_user_is_management()));
create policy "organisation_notepad_delete" on public.organisation_notepad for delete
using (organisation_id = public.current_organisation_id() and (created_by = auth.uid() or public.current_user_is_management()));

-- Home page news. All active staff can read it; only management can publish or maintain it.
drop policy if exists "organisation_news_read" on public.organisation_news;
drop policy if exists "organisation_news_insert" on public.organisation_news;
drop policy if exists "organisation_news_update" on public.organisation_news;
drop policy if exists "organisation_news_delete" on public.organisation_news;
create policy "organisation_news_read" on public.organisation_news for select
using (organisation_id = public.current_organisation_id());
create policy "organisation_news_insert" on public.organisation_news for insert
with check (organisation_id = public.current_organisation_id() and public.current_user_is_management());
create policy "organisation_news_update" on public.organisation_news for update
using (organisation_id = public.current_organisation_id() and public.current_user_is_management())
with check (organisation_id = public.current_organisation_id() and public.current_user_is_management());
create policy "organisation_news_delete" on public.organisation_news for delete
using (organisation_id = public.current_organisation_id() and public.current_user_is_management());

drop policy if exists "appointments_read" on public.appointments;
drop policy if exists "appointments_insert" on public.appointments;
drop policy if exists "appointments_update" on public.appointments;
create policy "appointments_read" on public.appointments for select using (organisation_id = public.current_organisation_id());
create policy "appointments_insert" on public.appointments for insert with check (organisation_id = public.current_organisation_id());
create policy "appointments_update" on public.appointments for update using (organisation_id = public.current_organisation_id()) with check (organisation_id = public.current_organisation_id());

-- Automatically scope organisation-level inserts to the signed-in user's organisation.
-- This keeps the desktop API simple and prevents cross-practice inserts.
create or replace function public.recordsweb_set_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organisation_id is null then
    new.organisation_id := public.current_organisation_id();
  end if;
  return new;
end;
$$;

drop trigger if exists staff_reports_set_org on public.staff_reports;
create trigger staff_reports_set_org before insert on public.staff_reports for each row execute function public.recordsweb_set_org();
drop trigger if exists staff_jobs_set_org on public.staff_jobs;
create trigger staff_jobs_set_org before insert on public.staff_jobs for each row execute function public.recordsweb_set_org();
drop trigger if exists staff_notices_set_org on public.staff_notices;
create trigger staff_notices_set_org before insert on public.staff_notices for each row execute function public.recordsweb_set_org();
drop trigger if exists organisation_notepad_set_org on public.organisation_notepad;
create trigger organisation_notepad_set_org before insert on public.organisation_notepad for each row execute function public.recordsweb_set_org();
drop trigger if exists organisation_news_set_org on public.organisation_news;
create trigger organisation_news_set_org before insert on public.organisation_news for each row execute function public.recordsweb_set_org();
drop trigger if exists appointments_set_org on public.appointments;
create trigger appointments_set_org before insert on public.appointments for each row execute function public.recordsweb_set_org();

-- BOOTSTRAP THE FIRST MANAGER
-- 1) In Supabase Dashboard > Authentication > Users, create:
--      manager.grove@gw.hc
--    with a strong temporary password and mark the email confirmed.
-- 2) Copy that auth user's UUID and run the statement below, replacing UUID:
--
-- insert into public.profiles
--   (id, organisation_id, username, title, first_name, last_name, display_name, role, roles, is_management, active)
-- select
--   'AUTH-USER-UUID', id, 'manager.grove@GW.HC', '', 'Practice', 'Manager', 'Practice Manager', 'Practice Manager', array['Practice Manager'], true, true
-- from public.organisations where org_code = 'GW.HC';
--
-- After that, the Management page can create further @GW.HC accounts through
-- the recordsweb-admin Edge Function.

-- RecordsWeb 2.4 application release control.
-- This table is intentionally readable before login so the desktop application
-- can verify its version before showing the sign-in screen. There are no normal
-- client write policies: publish releases from the Supabase dashboard/service role.
create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  channel text not null default 'stable',
  feed_url text, -- legacy/optional; v2.4+ binaries are delivered from GitHub Releases
  release_notes text,
  active boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (channel, version)
);

alter table public.app_releases enable row level security;
drop policy if exists "app_releases_public_read" on public.app_releases;
create policy "app_releases_public_read" on public.app_releases
for select to anon, authenticated
using (active = true);

-- RecordsWeb v2.4+ application binaries are hosted on GitHub Releases instead of
-- Supabase Storage. Existing recordsweb-updates buckets may be left in place or
-- removed manually; this schema intentionally does not delete Storage objects.

-- RecordsWeb staff-to-staff Screen Messages.
-- Staff need to be able to resolve other active colleagues by name/role when
-- choosing recipients, so profile directory visibility is organisation-wide.
drop policy if exists "profile_read" on public.profiles;
create policy "profile_read" on public.profiles for select to authenticated
using (
  id = auth.uid()
  or (
    organisation_id = public.current_organisation_id()
    and (active = true or public.current_user_is_management())
  )
);

create table if not exists public.staff_screen_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete restrict,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null default '',
  sender_role text not null default '',
  subject text not null check (char_length(subject) between 1 and 100),
  body text not null check (char_length(body) between 1 and 500),
  urgent boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists staff_screen_messages_recipient_idx on public.staff_screen_messages (recipient_id, created_at desc);
create index if not exists staff_screen_messages_org_idx on public.staff_screen_messages (organisation_id, created_at desc);

create or replace function public.recordsweb_screen_message_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  new.sender_id := auth.uid();
  new.organisation_id := public.current_organisation_id();

  select * into v_profile from public.profiles where id = auth.uid() and active = true;
  if v_profile.id is null then
    raise exception 'Active RecordsWeb profile required';
  end if;

  new.sender_name := coalesce(nullif(v_profile.display_name, ''), v_profile.username);
  new.sender_role := coalesce(nullif(v_profile.role, ''), 'Staff');
  return new;
end;
$$;

drop trigger if exists staff_screen_messages_defaults on public.staff_screen_messages;
create trigger staff_screen_messages_defaults
before insert on public.staff_screen_messages
for each row execute function public.recordsweb_screen_message_defaults();

alter table public.staff_screen_messages enable row level security;
drop policy if exists "screen_messages_read" on public.staff_screen_messages;
drop policy if exists "screen_messages_insert" on public.staff_screen_messages;
drop policy if exists "screen_messages_update" on public.staff_screen_messages;
create policy "screen_messages_read" on public.staff_screen_messages for select to authenticated
using (
  organisation_id = public.current_organisation_id()
  and (recipient_id = auth.uid() or public.current_user_is_management())
);
create policy "screen_messages_insert" on public.staff_screen_messages for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and sender_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = recipient_id
      and p.active = true
      and p.organisation_id = public.current_organisation_id()
  )
);
create policy "screen_messages_update" on public.staff_screen_messages for update to authenticated
using (organisation_id = public.current_organisation_id() and recipient_id = auth.uid())
with check (organisation_id = public.current_organisation_id() and recipient_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_screen_messages'
  ) then
    alter publication supabase_realtime add table public.staff_screen_messages;
  end if;
end $$;

-- Appointment status letters used by the staff-facing Appointment Book:
-- A = patient in reception
-- S = patient sent in / in the consulting room
-- L = consultation concluded and patient left
-- W = patient walked out before being seen

-- RecordsWeb 2.6.1 - private fit-note PDF archive.
create table if not exists public.fit_note_pdfs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  file_size bigint,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fit_note_pdfs_patient_created_idx on public.fit_note_pdfs (patient_id, created_at desc);
alter table public.fit_note_pdfs enable row level security;
grant select, insert, update, delete on public.fit_note_pdfs to authenticated;
drop policy if exists "fit_note_pdfs_read" on public.fit_note_pdfs;
drop policy if exists "fit_note_pdfs_insert" on public.fit_note_pdfs;
drop policy if exists "fit_note_pdfs_update" on public.fit_note_pdfs;
drop policy if exists "fit_note_pdfs_delete" on public.fit_note_pdfs;
create policy "fit_note_pdfs_read" on public.fit_note_pdfs for select to authenticated using (exists (select 1 from public.patients p where p.id = patient_id and p.organisation_id = public.current_organisation_id()));
create policy "fit_note_pdfs_insert" on public.fit_note_pdfs for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.patients p where p.id = patient_id and p.organisation_id = public.current_organisation_id()) and exists (select 1 from public.documents d where d.id = document_id and d.patient_id = patient_id));
create policy "fit_note_pdfs_update" on public.fit_note_pdfs for update to authenticated using (exists (select 1 from public.patients p where p.id = patient_id and p.organisation_id = public.current_organisation_id())) with check (exists (select 1 from public.patients p where p.id = patient_id and p.organisation_id = public.current_organisation_id()));
create policy "fit_note_pdfs_delete" on public.fit_note_pdfs for delete to authenticated using (exists (select 1 from public.patients p where p.id = patient_id and p.organisation_id = public.current_organisation_id()));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('recordsweb-documents','recordsweb-documents',false,10485760,array['application/pdf']) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "recordsweb_documents_read" on storage.objects;
drop policy if exists "recordsweb_documents_insert" on storage.objects;
drop policy if exists "recordsweb_documents_update" on storage.objects;
drop policy if exists "recordsweb_documents_delete" on storage.objects;
create policy "recordsweb_documents_read" on storage.objects for select to authenticated using (bucket_id = 'recordsweb-documents' and (storage.foldername(name))[1] = 'grove-way-health-centre' and exists (select 1 from public.patients p where p.id::text = (storage.foldername(name))[2] and p.organisation_id = public.current_organisation_id()));
create policy "recordsweb_documents_insert" on storage.objects for insert to authenticated with check (bucket_id = 'recordsweb-documents' and (storage.foldername(name))[1] = 'grove-way-health-centre' and exists (select 1 from public.patients p where p.id::text = (storage.foldername(name))[2] and p.organisation_id = public.current_organisation_id()));
create policy "recordsweb_documents_update" on storage.objects for update to authenticated using (bucket_id = 'recordsweb-documents' and (storage.foldername(name))[1] = 'grove-way-health-centre' and exists (select 1 from public.patients p where p.id::text = (storage.foldername(name))[2] and p.organisation_id = public.current_organisation_id())) with check (bucket_id = 'recordsweb-documents' and (storage.foldername(name))[1] = 'grove-way-health-centre' and exists (select 1 from public.patients p where p.id::text = (storage.foldername(name))[2] and p.organisation_id = public.current_organisation_id()));
create policy "recordsweb_documents_delete" on storage.objects for delete to authenticated using (bucket_id = 'recordsweb-documents' and (storage.foldername(name))[1] = 'grove-way-health-centre' and exists (select 1 from public.patients p where p.id::text = (storage.foldername(name))[2] and p.organisation_id = public.current_organisation_id()));


-- RecordsWeb 2.6.2 prescribing PIN security.


-- RecordsWeb 2.6.2 - per-user four digit prescribing PIN.
-- PINs are never stored in plaintext. Medication writes are routed through a
-- SECURITY DEFINER function that verifies the signed-in user's PIN.

create extension if not exists pgcrypto;

create table if not exists public.prescribing_pins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prescribing_pins enable row level security;
revoke all on public.prescribing_pins from anon, authenticated;

create or replace function public.recordsweb_has_prescribing_pin()
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.prescribing_pins pp
    join public.profiles p on p.id = pp.user_id
    where pp.user_id = auth.uid() and p.active = true
  );
$$;

create or replace function public.recordsweb_set_prescribing_pin(p_new_pin text, p_current_pin text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing public.prescribing_pins%rowtype;
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then raise exception 'Prescribing PIN must contain exactly 4 digits.'; end if;

  select * into v_profile from public.profiles where id = auth.uid() and active = true;
  if not found then raise exception 'Your RecordsWeb profile is not active.'; end if;

  select * into v_existing from public.prescribing_pins where user_id = auth.uid();
  if found then
    if p_current_pin is null or p_current_pin !~ '^[0-9]{4}$' then raise exception 'Enter your current 4-digit prescribing PIN.'; end if;
    if v_existing.pin_hash <> crypt(p_current_pin, v_existing.pin_hash) then raise exception 'Current prescribing PIN is incorrect.'; end if;
    update public.prescribing_pins
      set pin_hash = crypt(p_new_pin, gen_salt('bf', 10)), updated_at = now()
      where user_id = auth.uid();
  else
    insert into public.prescribing_pins (user_id, pin_hash)
    values (auth.uid(), crypt(p_new_pin, gen_salt('bf', 10)));
  end if;
  return true;
end;
$$;

create or replace function public.recordsweb_save_medication(
  p_patient_id uuid,
  p_medication_id uuid,
  p_payload jsonb,
  p_pin text
)
returns public.medications
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
  v_pin public.prescribing_pins%rowtype;
  v_med public.medications%rowtype;
  v_authoriser text;
  v_type text;
  v_name text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'Enter your 4-digit prescribing PIN.'; end if;

  select * into v_profile from public.profiles where id = auth.uid() and active = true;
  if not found then raise exception 'Your RecordsWeb profile is not active.'; end if;

  select * into v_pin from public.prescribing_pins where user_id = auth.uid();
  if not found then raise exception 'Create a prescribing PIN before authorising medication.'; end if;
  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then raise exception 'Prescribing PIN is incorrect.'; end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organisation_id = v_profile.organisation_id
  ) then raise exception 'Patient is not available to your organisation.'; end if;

  v_name := trim(coalesce(p_payload->>'name',''));
  if v_name = '' then raise exception 'Medication name is required.'; end if;
  v_type := coalesce(nullif(p_payload->>'type',''), 'Acute Meds');
  if v_type not in ('Acute Meds','Repeat','Long Term Meds') then raise exception 'Medication group is invalid.'; end if;
  v_authoriser := coalesce(nullif(trim(concat_ws(' ', v_profile.title, v_profile.first_name, v_profile.last_name)), ''), v_profile.display_name, v_profile.username);

  if p_medication_id is null then
    insert into public.medications (
      patient_id, name, dose, quantity, type, last_issue_date,
      authoriser, issues, method, usage, active
    ) values (
      p_patient_id,
      v_name,
      nullif(p_payload->>'dose',''),
      nullif(p_payload->>'quantity',''),
      v_type,
      nullif(p_payload->>'last_issue_date','')::date,
      v_authoriser,
      nullif(p_payload->>'issues',''),
      nullif(p_payload->>'method',''),
      nullif(p_payload->>'usage',''),
      coalesce((p_payload->>'active')::boolean, true)
    ) returning * into v_med;
  else
    update public.medications m set
      name = v_name,
      dose = nullif(p_payload->>'dose',''),
      quantity = nullif(p_payload->>'quantity',''),
      type = v_type,
      last_issue_date = nullif(p_payload->>'last_issue_date','')::date,
      authoriser = v_authoriser,
      issues = nullif(p_payload->>'issues',''),
      method = nullif(p_payload->>'method',''),
      usage = nullif(p_payload->>'usage',''),
      active = coalesce((p_payload->>'active')::boolean, m.active),
      updated_at = now()
    where m.id = p_medication_id and m.patient_id = p_patient_id
    returning * into v_med;
    if not found then raise exception 'Medication record was not found.'; end if;
  end if;

  return v_med;
end;
$$;

revoke all on function public.recordsweb_has_prescribing_pin() from public, anon;
revoke all on function public.recordsweb_set_prescribing_pin(text, text) from public, anon;
revoke all on function public.recordsweb_save_medication(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.recordsweb_has_prescribing_pin() to authenticated;
grant execute on function public.recordsweb_set_prescribing_pin(text, text) to authenticated;
grant execute on function public.recordsweb_save_medication(uuid, uuid, jsonb, text) to authenticated;

-- Prevent authenticated clients from bypassing the PIN by writing medication rows
-- directly. Reads remain available through existing organisation RLS.
revoke insert, update on public.medications from authenticated, anon;

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


-- RecordsWeb 3.1.2 - Management account controls.
-- Adds Management-only disable reasons and application-level forced logout support.
-- Safe to re-run after the existing RecordsWeb schema/migrations.

alter table public.profiles
  add column if not exists disabled_reason text,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references public.profiles(id) on delete set null,
  add column if not exists force_logout_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_disabled_reason_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_disabled_reason_length
      check (disabled_reason is null or char_length(disabled_reason) <= 500);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;


-- RecordsWeb 3.1.5 immutable fit-note guard

alter table public.documents add column if not exists immutable boolean not null default false;
alter table public.documents add column if not exists locked_at timestamptz;
alter table public.documents add column if not exists locked_by uuid references public.profiles(id) on delete set null;

-- Existing issued fit notes become immutable immediately.
update public.documents
set immutable = true,
    locked_at = coalesce(locked_at, created_at, now()),
    status = 'Signed'
where (document_type = 'Fit Note' or category = 'Fit Note')
  and immutable = false;

create or replace function public.recordsweb_prevent_locked_document_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.immutable then
      raise exception 'Signed fit notes cannot be deleted or edited.' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.immutable then
    -- Permit only the one-time attachment of an archived PDF to a locked legacy
    -- fit note. No clinical/document content may change at the same time.
    if old.storage_path is null
       and new.storage_path is not null
       and new.id is not distinct from old.id
       and new.patient_id is not distinct from old.patient_id
       and new.title is not distinct from old.title
       and new.category is not distinct from old.category
       and new.date is not distinct from old.date
       and new.author is not distinct from old.author
       and new.document_type is not distinct from old.document_type
       and new.status is not distinct from old.status
       and new.details is not distinct from old.details
       and new.immutable is not distinct from old.immutable
       and new.locked_at is not distinct from old.locked_at
       and new.locked_by is not distinct from old.locked_by
    then
      return new;
    end if;

    raise exception 'Signed fit notes cannot be edited.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists recordsweb_locked_document_guard on public.documents;
create trigger recordsweb_locked_document_guard
before update or delete on public.documents
for each row execute function public.recordsweb_prevent_locked_document_change();

create or replace function public.recordsweb_lock_fit_note(p_document_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select d.* into v_document
  from public.documents d
  join public.patients p on p.id = d.patient_id
  where d.id = p_document_id
    and p.organisation_id = public.current_organisation_id()
    and (d.document_type = 'Fit Note' or d.category = 'Fit Note');

  if not found then
    raise exception 'Fit note not found.';
  end if;

  if v_document.immutable then
    return v_document;
  end if;

  update public.documents
  set immutable = true,
      locked_at = now(),
      locked_by = auth.uid(),
      status = 'Signed'
  where id = p_document_id
  returning * into v_document;

  return v_document;
end;
$$;

grant execute on function public.recordsweb_lock_fit_note(uuid) to authenticated;


-- BEGIN RecordsWeb 3.1.9 multi-organisation finalisation

-- RecordsWeb 3.1.9 - Multi-organisation deployment support
--
-- Adds organisation installation namespaces (for example @GW.HC), organisation
-- mode metadata, safe pre-login organisation discovery, automatic organisation
-- scoping for patient creation, dynamic Storage RLS and organisation provisioning.
--
-- Safe to re-run after the existing RecordsWeb schema/migrations.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organisation metadata and namespace validation
-- ---------------------------------------------------------------------------

alter table public.organisations
  add column if not exists active boolean not null default true,
  add column if not exists system_mode text not null default 'general_practice',
  add column if not exists default_location text not null default 'Main Site';

-- Existing RecordsWeb organisation codes are normalised before enforcing the
-- four-letter XX.XX namespace format.
update public.organisations
set org_code = upper(trim(org_code));

update public.organisations
set
  system_mode = case when system_mode = 'hospital' then 'hospital' else 'general_practice' end,
  default_location = case
    when org_code = 'GW.HC' and (default_location is null or trim(default_location) = '' or default_location = 'Main Site') then 'Main Building'
    when default_location is null or trim(default_location) = '' then 'Main Site'
    else trim(default_location)
  end;

update public.organisations
set active = true
where active is null;

do $$
begin
  if exists (
    select 1
    from public.organisations
    where org_code !~ '^[A-Z]{2}\.[A-Z]{2}$'
  ) then
    raise exception 'RecordsWeb multi-organisation migration stopped: every organisations.org_code must use the XX.XX format before this migration can continue.';
  end if;
end $$;

do $$ begin
  alter table public.organisations
    add constraint organisations_org_code_format
    check (org_code ~ '^[A-Z]{2}\.[A-Z]{2}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.organisations
    add constraint organisations_system_mode_allowed
    check (system_mode in ('general_practice', 'hospital'));
exception when duplicate_object then null; end $$;

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
  if new.system_mode not in ('general_practice', 'hospital') then
    raise exception 'RecordsWeb mode must be general_practice or hospital.';
  end if;
  if new.default_location = '' then
    new.default_location := 'Main Site';
  end if;

  return new;
end;
$$;

drop trigger if exists recordsweb_normalise_organisation on public.organisations;
create trigger recordsweb_normalise_organisation
before insert or update of org_code, name, system_mode, default_location
on public.organisations
for each row execute function public.recordsweb_normalise_organisation();

-- Ensure the existing Grove Way deployment retains its current identity.
update public.organisations
set
  name = 'Grove Way Health Centre',
  system_mode = 'general_practice',
  default_location = 'Main Building',
  active = true
where org_code = 'GW.HC';

-- ---------------------------------------------------------------------------
-- Current organisation helpers
-- ---------------------------------------------------------------------------

-- Replace the legacy helper so an organisation being disabled immediately
-- closes the RLS boundary for its clinical data, even for an already-open
-- authenticated session. The helper remains SECURITY DEFINER so it can safely
-- inspect the staff profile and organisation while those tables use RLS.
create or replace function public.current_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organisation_id
  from public.profiles p
  join public.organisations o on o.id = p.organisation_id
  where p.id = auth.uid()
    and p.active = true
    and o.active = true
  limit 1
$$;

revoke all on function public.current_organisation_id() from public;
grant execute on function public.current_organisation_id() to authenticated;

create or replace function public.current_user_is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_management
    from public.profiles p
    join public.organisations o on o.id = p.organisation_id
    where p.id = auth.uid()
      and p.active = true
      and o.active = true
    limit 1
  ), false)
$$;

revoke all on function public.current_user_is_management() from public;
grant execute on function public.current_user_is_management() to authenticated;

create or replace function public.current_organisation_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select o.org_code
  from public.profiles p
  join public.organisations o on o.id = p.organisation_id
  where p.id = auth.uid() and p.active = true and o.active = true
  limit 1
$$;

revoke all on function public.current_organisation_code() from public;
grant execute on function public.current_organisation_code() to authenticated;

-- Public, deliberately limited organisation lookup used before login. It does
-- not expose staff, patient or configuration secrets.
create or replace function public.recordsweb_public_organisation_config(
  p_organisation_code text
)
returns table (
  id uuid,
  org_code text,
  name text,
  system_mode text,
  default_location text,
  active boolean,
  primary_color text,
  navigation_color text,
  patient_banner_color text,
  logo_data_url text,
  logo_path text,
  logo_file_name text,
  logo_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  v_code := upper(regexp_replace(trim(coalesce(p_organisation_code, '')), '^@+', ''));
  if v_code !~ '^[A-Z]{2}\.[A-Z]{2}$' then
    return;
  end if;

  return query
  select
    o.id,
    o.org_code,
    o.name,
    o.system_mode,
    o.default_location,
    o.active,
    o.primary_color,
    o.navigation_color,
    o.patient_banner_color,
    o.logo_data_url,
    o.logo_path,
    o.logo_file_name,
    o.logo_updated_at
  from public.organisations o
  where o.org_code = v_code
  limit 1;
end;
$$;

revoke all on function public.recordsweb_public_organisation_config(text) from public;
grant execute on function public.recordsweb_public_organisation_config(text) to anon, authenticated;

-- The organisations table itself is no longer anonymously readable. Before
-- login, the app uses the compact RPC above. After login, staff can only read
-- their own organisation row.
alter table public.organisations enable row level security;
revoke select on public.organisations from anon;
grant select on public.organisations to authenticated;

drop policy if exists "organisation_read" on public.organisations;
create policy "organisation_read"
on public.organisations
for select
to authenticated
using (id = public.current_organisation_id());

-- ---------------------------------------------------------------------------
-- Enforce the @XX.XX namespace on staff profiles
-- ---------------------------------------------------------------------------

create or replace function public.recordsweb_validate_profile_namespace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_username text;
  v_local text;
  v_domain text;
begin
  select o.org_code into v_code
  from public.organisations o
  where o.id = new.organisation_id and o.active = true;

  if v_code is null then
    raise exception 'The RecordsWeb organisation is missing or inactive.';
  end if;

  v_username := trim(coalesce(new.username, ''));
  if v_username = '' then
    raise exception 'RecordsWeb username is required.';
  end if;

  if position('@' in v_username) = 0 then
    v_local := lower(v_username);
    v_domain := v_code;
  else
    v_local := lower(split_part(v_username, '@', 1));
    v_domain := upper(regexp_replace(trim(substring(v_username from position('@' in v_username) + 1)), '^@+', ''));
  end if;

  if v_local = '' or v_domain <> v_code then
    raise exception 'RecordsWeb username must use the @% organisation extension.', v_code;
  end if;

  new.username := v_local || '@' || v_code;
  return new;
end;
$$;

drop trigger if exists recordsweb_validate_profile_namespace on public.profiles;
create trigger recordsweb_validate_profile_namespace
before insert or update of username, organisation_id
on public.profiles
for each row execute function public.recordsweb_validate_profile_namespace();

-- Normalise existing profile usernames where the account already belongs to
-- its matching organisation. Legacy local-only usernames receive the correct
-- suffix. This does not alter auth.users email addresses.
update public.profiles p
set username = case
  when position('@' in trim(coalesce(p.username, ''))) = 0
    then lower(trim(p.username)) || '@' || o.org_code
  else lower(split_part(trim(p.username), '@', 1)) || '@' || o.org_code
end
from public.organisations o
where o.id = p.organisation_id
  and trim(coalesce(p.username, '')) <> ''
  and (
    position('@' in trim(p.username)) = 0
    or upper(substring(trim(p.username) from position('@' in trim(p.username)) + 1)) = o.org_code
  );

-- Refuse to leave an ambiguous or cross-organisation username in place. This
-- makes bad legacy data visible during migration rather than allowing a later
-- login or management action to behave unpredictably.
do $$
begin
  if exists (
    select 1
    from public.profiles p
    join public.organisations o on o.id = p.organisation_id
    where trim(coalesce(p.username, '')) = ''
       or position('@' in trim(p.username)) = 0
       or upper(substring(trim(p.username) from position('@' in trim(p.username)) + 1)) <> o.org_code
  ) then
    raise exception 'RecordsWeb multi-organisation migration stopped: one or more profiles have a username that does not match their organisation extension. Correct those profile usernames, then run this migration again.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Automatic organisation scoping
-- ---------------------------------------------------------------------------

-- Existing RecordsWeb already scopes organisation-level tables with this
-- trigger function. Patients now use the same mechanism so the renderer never
-- has to know or trust an organisation UUID when creating a patient.
drop trigger if exists patients_set_org on public.patients;
create trigger patients_set_org
before insert on public.patients
for each row execute function public.recordsweb_set_org();

-- ---------------------------------------------------------------------------
-- Multi-organisation branding Storage RLS
-- ---------------------------------------------------------------------------

-- New uploads are stored under <organisation UUID>/..., while the legacy Grove
-- Way path remains readable/manageable so existing logos continue to work.
drop policy if exists "recordsweb_branding_management_insert" on storage.objects;
drop policy if exists "recordsweb_branding_management_update" on storage.objects;
drop policy if exists "recordsweb_branding_management_delete" on storage.objects;

create policy "recordsweb_branding_management_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create policy "recordsweb_branding_management_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
)
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create policy "recordsweb_branding_management_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
);

-- ---------------------------------------------------------------------------
-- Multi-organisation clinical document Storage RLS
-- ---------------------------------------------------------------------------

-- Existing Grove Way PDFs used grove-way-health-centre/<patient UUID>/... .
-- Keep that legacy path available only to GW.HC while all new files use the
-- organisation UUID as their first path segment.
drop policy if exists "recordsweb_documents_read" on storage.objects;
drop policy if exists "recordsweb_documents_insert" on storage.objects;
drop policy if exists "recordsweb_documents_update" on storage.objects;
drop policy if exists "recordsweb_documents_delete" on storage.objects;

create policy "recordsweb_documents_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-documents'
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
)
with check (
  bucket_id = 'recordsweb-documents'
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

-- ---------------------------------------------------------------------------
-- Organisation-aware maintenance state
-- ---------------------------------------------------------------------------

insert into public.system_maintenance (organisation_code, organisation_id)
select o.org_code, o.id
from public.organisations o
on conflict (organisation_code) do update
set organisation_id = excluded.organisation_id;

create or replace function public.recordsweb_public_maintenance_state(
  p_organisation_code text default null
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
declare
  v_code text;
begin
  v_code := upper(regexp_replace(trim(coalesce(p_organisation_code, '')), '^@+', ''));

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
  join public.organisations o on o.id = m.organisation_id
  where m.organisation_code = v_code
    and o.active = true
  limit 1;

  if not found then
    return query select
      v_code::text,
      false,
      'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.'::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::timestamptz;
  end if;
end;
$$;

revoke all on function public.recordsweb_public_maintenance_state(text) from public;
grant execute on function public.recordsweb_public_maintenance_state(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Operator-only organisation provisioning helper
-- ---------------------------------------------------------------------------

create or replace function public.recordsweb_provision_organisation(
  p_org_code text,
  p_name text,
  p_system_mode text default 'general_practice',
  p_default_location text default 'Main Site'
)
returns public.organisations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_mode text;
  v_name text;
  v_location text;
  v_org public.organisations%rowtype;
begin
  v_code := upper(regexp_replace(trim(coalesce(p_org_code, '')), '^@+', ''));
  v_mode := lower(trim(coalesce(p_system_mode, 'general_practice')));
  v_name := trim(coalesce(p_name, ''));
  v_location := trim(coalesce(p_default_location, 'Main Site'));

  if v_code !~ '^[A-Z]{2}\.[A-Z]{2}$' then
    raise exception 'Organisation extension must use four letters in the format @XX.XX.';
  end if;
  if v_name = '' then
    raise exception 'Organisation name is required.';
  end if;
  if v_mode not in ('general_practice', 'hospital') then
    raise exception 'RecordsWeb mode must be general_practice or hospital.';
  end if;
  if v_location = '' then v_location := 'Main Site'; end if;

  insert into public.organisations (
    org_code, name, system_mode, default_location, active
  ) values (
    v_code, v_name, v_mode, v_location, true
  )
  on conflict (org_code) do update set
    name = excluded.name,
    system_mode = excluded.system_mode,
    default_location = excluded.default_location,
    active = true
  returning * into v_org;

  insert into public.system_maintenance (organisation_code, organisation_id)
  values (v_org.org_code, v_org.id)
  on conflict (organisation_code) do update
  set organisation_id = excluded.organisation_id;

  return v_org;
end;
$$;

-- This helper is intentionally not exposed to the RecordsWeb client. Run it as
-- the database owner in the Supabase SQL Editor, or from a trusted service-role
-- backend when approving a new organisation.
revoke all on function public.recordsweb_provision_organisation(text, text, text, text) from public, anon, authenticated;
grant execute on function public.recordsweb_provision_organisation(text, text, text, text) to service_role;

-- Example (run manually when an organisation is approved):
-- select (public.recordsweb_provision_organisation(
--   'AB.CD',
--   'Example Health Organisation',
--   'general_practice', -- or 'hospital'
--   'Main Site'
-- )).*;
--
-- Then create the organisation's first manager in Supabase Authentication and
-- insert the matching public.profiles row using that organisation's UUID.


-- ---------------------------------------------------------------------------
-- RecordsWeb fixed product branding (3.2.1)
-- ---------------------------------------------------------------------------
-- RecordsWeb fixed-branding lock
-- Keeps the product identity identical across every organisation.
-- Organisation names, codes, modes and locations remain tenant-specific.


-- Normalise any branding values saved by older RecordsWeb versions.
update public.organisations
set
  primary_color = '#0f6fbd',
  navigation_color = '#cfe7f8',
  patient_banner_color = '#753b0d',
  logo_data_url = null,
  logo_path = null,
  logo_file_name = null,
  logo_updated_at = null;

-- Enforce the product-owned brand even if an older client attempts to update
-- these columns directly. This preserves all non-brand organisation fields.
create or replace function public.recordsweb_enforce_fixed_branding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.primary_color := '#0f6fbd';
  new.navigation_color := '#cfe7f8';
  new.patient_banner_color := '#753b0d';
  new.logo_data_url := null;
  new.logo_path := null;
  new.logo_file_name := null;
  new.logo_updated_at := null;
  return new;
end;
$$;

drop trigger if exists recordsweb_fixed_branding on public.organisations;
create trigger recordsweb_fixed_branding
before insert or update on public.organisations
for each row execute function public.recordsweb_enforce_fixed_branding();

-- Organisation branding uploads are no longer part of RecordsWeb. Existing
-- files are left intact for safe migration/history, but the bucket is private
-- and normal authenticated users can no longer insert, replace or delete them.
update storage.buckets
set public = false
where id = 'recordsweb-branding';

drop policy if exists "recordsweb_branding_management_insert" on storage.objects;
drop policy if exists "recordsweb_branding_management_update" on storage.objects;
drop policy if exists "recordsweb_branding_management_delete" on storage.objects;

-- Keep the legacy RPC shape for older clients, but never expose tenant branding
-- values. New RecordsWeb clients only use identity/configuration fields.
create or replace function public.recordsweb_public_organisation_config(
  p_organisation_code text
)
returns table (
  id uuid,
  org_code text,
  name text,
  system_mode text,
  default_location text,
  active boolean,
  primary_color text,
  navigation_color text,
  patient_banner_color text,
  logo_data_url text,
  logo_path text,
  logo_file_name text,
  logo_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  v_code := upper(regexp_replace(trim(coalesce(p_organisation_code, '')), '^@+', ''));
  if v_code !~ '^[A-Z]{2}\.[A-Z]{2}$' then
    return;
  end if;

  return query
  select
    o.id,
    o.org_code,
    o.name,
    o.system_mode,
    o.default_location,
    o.active,
    '#0f6fbd'::text,
    '#cfe7f8'::text,
    '#753b0d'::text,
    null::text,
    null::text,
    null::text,
    null::timestamptz
  from public.organisations o
  where o.org_code = v_code
  limit 1;
end;
$$;

revoke all on function public.recordsweb_public_organisation_config(text) from public;
grant execute on function public.recordsweb_public_organisation_config(text) to anon, authenticated;

-- RecordsWeb 3.2.1 — platform operator management
-- Platform-wide controls are no longer available to community Management.
-- Authorised operator identities: gus.farnsworth@XX.XX or alfie.james@XX.XX, where XX.XX matches the
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
      email ~ '^(gus\.farnsworth|alfie\.james)@[a-z]{2}\.[a-z]{2}$'
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



-- RecordsWeb 3.2.3
-- Per-community Roblox bridge for waiting-room / patient-call displays.
-- Run after the RecordsWeb multi-organisation migrations.

create extension if not exists pgcrypto;

create table if not exists public.recordsweb_roblox_integrations (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  enabled boolean not null default false,
  key_hash text unique,
  key_last_four text,
  key_created_at timestamptz,
  universe_id text,
  place_ids text[] not null default '{}'::text[],
  display_name_mode text not null default 'first_name_last_initial'
    check (display_name_mode in ('first_name_last_initial','full_name','record_number')),
  display_duration_seconds integer not null default 12
    check (display_duration_seconds between 5 and 60),
  last_heartbeat_at timestamptz,
  last_universe_id text,
  last_place_id text,
  last_server_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recordsweb_roblox_display_events (
  id bigint generated by default as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  event_type text not null default 'patient_called' check (event_type in ('patient_called')),
  display_name text not null,
  destination text not null,
  clinician text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes')
);

-- Create a disabled integration settings row for every existing community.
-- The secret connection code is intentionally generated later from Management so
-- its plaintext can be shown exactly once to an authorised manager.
insert into public.recordsweb_roblox_integrations (organisation_id)
select id from public.organisations
on conflict (organisation_id) do nothing;

create index if not exists recordsweb_roblox_events_org_id_idx
  on public.recordsweb_roblox_display_events (organisation_id, id);
create index if not exists recordsweb_roblox_events_expiry_idx
  on public.recordsweb_roblox_display_events (expires_at);
create index if not exists recordsweb_roblox_integration_key_idx
  on public.recordsweb_roblox_integrations (key_hash)
  where key_hash is not null;

alter table public.recordsweb_roblox_integrations enable row level security;
alter table public.recordsweb_roblox_display_events enable row level security;

-- These tables are deliberately not exposed directly to browser/app clients.
-- Authenticated Management users operate them through recordsweb-roblox-admin;
-- Roblox servers operate them through recordsweb-game-api using the per-community secret.
revoke all on table public.recordsweb_roblox_integrations from anon, authenticated;
revoke all on table public.recordsweb_roblox_display_events from anon, authenticated;

create or replace function public.recordsweb_queue_roblox_patient_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_integration public.recordsweb_roblox_integrations%rowtype;
  v_patient public.patients%rowtype;
  v_display_name text;
  v_destination text;
  v_should_call boolean := false;
begin
  if new.organisation_id is null or new.patient_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_should_call := new.status in ('Sent in', 'In consultation');
  else
    v_should_call := new.status in ('Sent in', 'In consultation')
      and old.status is distinct from new.status
      and coalesce(old.status, '') not in ('Sent in', 'In consultation');
  end if;

  if not v_should_call then
    return new;
  end if;

  select * into v_integration
  from public.recordsweb_roblox_integrations
  where organisation_id = new.organisation_id
    and enabled = true
    and key_hash is not null;

  if not found then
    return new;
  end if;

  select * into v_patient
  from public.patients
  where id = new.patient_id
    and organisation_id = new.organisation_id;

  if not found then
    return new;
  end if;

  case v_integration.display_name_mode
    when 'full_name' then
      v_display_name := trim(concat_ws(' ', nullif(v_patient.title, ''), v_patient.first_name, v_patient.last_name));
    when 'record_number' then
      v_display_name := case
        when nullif(trim(coalesce(v_patient.emis_number, '')), '') is not null
          then 'Patient ' || trim(v_patient.emis_number)
        else 'Patient'
      end;
    else
      v_display_name := trim(v_patient.first_name || ' ' || left(v_patient.last_name, 1) || '.');
  end case;

  v_destination := coalesce(nullif(trim(new.room), ''), 'Consulting room');

  insert into public.recordsweb_roblox_display_events (
    organisation_id,
    appointment_id,
    event_type,
    display_name,
    destination,
    clinician,
    expires_at
  ) values (
    new.organisation_id,
    new.id,
    'patient_called',
    v_display_name,
    v_destination,
    nullif(trim(coalesce(new.clinician, '')), ''),
    now() + interval '2 minutes'
  );

  -- Keep the queue table small without deleting events that a temporarily
  -- disconnected server might still need during their short validity window.
  delete from public.recordsweb_roblox_display_events
  where organisation_id = new.organisation_id
    and expires_at < now() - interval '1 day';

  return new;
end;
$$;

revoke all on function public.recordsweb_queue_roblox_patient_call() from public;

-- Separate triggers keep compatibility across PostgreSQL versions while
-- supporting both appointments created already in the sent-in state and later updates.
drop trigger if exists recordsweb_roblox_patient_call_insert on public.appointments;
create trigger recordsweb_roblox_patient_call_insert
after insert on public.appointments
for each row execute function public.recordsweb_queue_roblox_patient_call();

drop trigger if exists recordsweb_roblox_patient_call_update on public.appointments;
create trigger recordsweb_roblox_patient_call_update
after update of status on public.appointments
for each row execute function public.recordsweb_queue_roblox_patient_call();

comment on table public.recordsweb_roblox_integrations is
  'RecordsWeb 3.2.3 per-community Roblox bridge settings and hashed connection credentials.';
comment on table public.recordsweb_roblox_display_events is
  'Short-lived server-to-server patient-call events consumed by authorised Roblox game servers.';


-- RecordsWeb 3.2.4 — per-community branding
-- Community management may customise its own icon and clinical interface colours.
-- The RecordsWeb product name and platform/public website branding remain product-owned.

begin;

alter table public.organisations add column if not exists primary_color text not null default '#0f6fbd';
alter table public.organisations add column if not exists navigation_color text not null default '#cfe7f8';
alter table public.organisations add column if not exists patient_banner_color text not null default '#753b0d';
alter table public.organisations add column if not exists logo_data_url text;
alter table public.organisations add column if not exists logo_path text;
alter table public.organisations add column if not exists logo_file_name text;
alter table public.organisations add column if not exists logo_updated_at timestamptz;

drop trigger if exists recordsweb_fixed_branding on public.organisations;
drop function if exists public.recordsweb_enforce_fixed_branding();

create or replace function public.recordsweb_validate_community_branding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.primary_color is null or new.primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid primary community colour.';
  end if;

  if new.navigation_color is null or new.navigation_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid navigation community colour.';
  end if;

  if new.patient_banner_color is null or new.patient_banner_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid patient banner community colour.';
  end if;

  if new.logo_path is not null and trim(new.logo_path) <> '' then
    if new.id is null or new.logo_path not like (new.id::text || '/%') then
      raise exception 'Community logo path must belong to the same organisation.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists recordsweb_validate_community_branding on public.organisations;
create trigger recordsweb_validate_community_branding
before insert or update of primary_color, navigation_color, patient_banner_color, logo_path
on public.organisations
for each row execute function public.recordsweb_validate_community_branding();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordsweb-branding',
  'recordsweb-branding',
  true,
  4194304,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recordsweb_branding_management_insert" on storage.objects;
drop policy if exists "recordsweb_branding_management_update" on storage.objects;
drop policy if exists "recordsweb_branding_management_delete" on storage.objects;

create policy "recordsweb_branding_management_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create policy "recordsweb_branding_management_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
)
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create policy "recordsweb_branding_management_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create or replace function public.recordsweb_public_organisation_config(
  p_organisation_code text
)
returns table (
  id uuid,
  org_code text,
  name text,
  system_mode text,
  default_location text,
  active boolean,
  primary_color text,
  navigation_color text,
  patient_banner_color text,
  logo_data_url text,
  logo_path text,
  logo_file_name text,
  logo_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  v_code := upper(regexp_replace(trim(coalesce(p_organisation_code, '')), '^@+', ''));

  if v_code !~ '^[A-Z]{2}\.[A-Z]{2}$' then
    return;
  end if;

  return query
  select
    o.id,
    o.org_code,
    o.name,
    o.system_mode,
    o.default_location,
    o.active,
    o.primary_color,
    o.navigation_color,
    o.patient_banner_color,
    o.logo_data_url,
    o.logo_path,
    o.logo_file_name,
    o.logo_updated_at
  from public.organisations o
  where o.org_code = v_code
  limit 1;
end;
$$;

revoke all on function public.recordsweb_public_organisation_config(text) from public;
grant execute on function public.recordsweb_public_organisation_config(text) to anon, authenticated;

commit;

-- RecordsWeb 3.2.5 — public pricing and organisation billing state
-- Adds manual billing metadata used by Platform Management and the organisation Management screen.
-- This migration does not process payments or automatically suspend organisations.

begin;

alter table public.organisations add column if not exists billing_plan text not null default 'standard';
alter table public.organisations add column if not exists billing_status text not null default 'active';
alter table public.organisations add column if not exists billing_monthly_price numeric(8,2) not null default 9.50;
alter table public.organisations add column if not exists billing_first_month_price numeric(8,2) not null default 5.00;
alter table public.organisations add column if not exists billing_first_month_offer boolean not null default false;
alter table public.organisations add column if not exists billing_setup_fee numeric(8,2) not null default 7.00;
alter table public.organisations add column if not exists billing_start_date date;
alter table public.organisations add column if not exists billing_next_date date;
alter table public.organisations add column if not exists announcement_board_enabled boolean not null default false;
alter table public.organisations add column if not exists announcement_board_fee numeric(8,2) not null default 10.00;
alter table public.organisations add column if not exists billing_notes text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_billing_status_allowed') then
    alter table public.organisations add constraint organisations_billing_status_allowed
      check (billing_status in ('setup','active','overdue','suspended','complimentary'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisations_billing_plan_allowed') then
    alter table public.organisations add constraint organisations_billing_plan_allowed
      check (billing_plan in ('standard'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisations_billing_amounts_nonnegative') then
    alter table public.organisations add constraint organisations_billing_amounts_nonnegative
      check (
        billing_monthly_price >= 0 and billing_monthly_price < 10000 and
        billing_first_month_price >= 0 and billing_first_month_price < 10000 and
        billing_setup_fee >= 0 and billing_setup_fee < 10000 and
        announcement_board_fee >= 0 and announcement_board_fee < 10000
      );
  end if;
end $$;


-- Billing fields are controlled by RecordsWeb Platform Management. Community
-- managers can still update branding on their organisation row, but cannot
-- alter their own subscription or pricing through the client API.
create or replace function public.recordsweb_protect_organisation_billing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'RecordsWeb billing fields can only be changed by Platform Management.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists recordsweb_protect_organisation_billing_fields on public.organisations;
create trigger recordsweb_protect_organisation_billing_fields
before update of
  billing_plan,
  billing_status,
  billing_monthly_price,
  billing_first_month_price,
  billing_first_month_offer,
  billing_setup_fee,
  billing_start_date,
  billing_next_date,
  announcement_board_enabled,
  announcement_board_fee,
  billing_notes
on public.organisations
for each row
execute function public.recordsweb_protect_organisation_billing();

-- Recreate the operator list with billing fields. PostgreSQL requires the old
-- function to be dropped when the return table definition changes.
drop function if exists public.recordsweb_operator_list_organisations();
create function public.recordsweb_operator_list_organisations()
returns table (
  id uuid,
  org_code text,
  name text,
  system_mode text,
  default_location text,
  active boolean,
  created_at timestamptz,
  has_reserved_operator boolean,
  billing_plan text,
  billing_status text,
  billing_monthly_price numeric,
  billing_first_month_price numeric,
  billing_first_month_offer boolean,
  billing_setup_fee numeric,
  billing_start_date date,
  billing_next_date date,
  announcement_board_enabled boolean,
  announcement_board_fee numeric,
  billing_notes text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.recordsweb_is_platform_operator() then
    raise exception 'Access denied: RecordsWeb platform operator permission is required.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.org_code,
    o.name,
    o.system_mode,
    o.default_location,
    o.active,
    o.created_at,
    exists (
      select 1 from public.profiles p
      where p.organisation_id = o.id
        and p.active = true
        and lower(p.username) = lower('gus.farnsworth@' || o.org_code)
    ) as has_reserved_operator,
    o.billing_plan,
    o.billing_status,
    o.billing_monthly_price,
    o.billing_first_month_price,
    o.billing_first_month_offer,
    o.billing_setup_fee,
    o.billing_start_date,
    o.billing_next_date,
    o.announcement_board_enabled,
    o.announcement_board_fee,
    o.billing_notes
  from public.organisations o
  order by lower(o.name), o.org_code;
end;
$$;

revoke all on function public.recordsweb_operator_list_organisations() from public;
grant execute on function public.recordsweb_operator_list_organisations() to authenticated;

commit;

-- RecordsWeb 3.2.6 — Stripe subscription billing and payment exemptions
-- Run after recordsweb-3.2.5-pricing-billing.sql.
-- Stripe secret keys are NOT stored in Postgres; configure them as Supabase Edge Function secrets.

begin;

alter table public.organisations add column if not exists billing_payment_exempt boolean not null default false;
alter table public.organisations add column if not exists billing_exemption_reason text;
alter table public.organisations add column if not exists billing_email text;
alter table public.organisations add column if not exists billing_setup_fee_paid_at timestamptz;
alter table public.organisations add column if not exists billing_first_month_offer_redeemed_at timestamptz;
alter table public.organisations add column if not exists announcement_board_paid_at timestamptz;
alter table public.organisations add column if not exists stripe_customer_id text;
alter table public.organisations add column if not exists stripe_subscription_id text;
alter table public.organisations add column if not exists stripe_subscription_status text;
alter table public.organisations add column if not exists stripe_last_invoice_status text;
alter table public.organisations add column if not exists stripe_checkout_session_id text;
alter table public.organisations add column if not exists stripe_current_period_end timestamptz;
alter table public.organisations add column if not exists stripe_last_payment_at timestamptz;
alter table public.organisations add column if not exists stripe_environment text;
alter table public.organisations add column if not exists stripe_updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_stripe_environment_allowed') then
    alter table public.organisations add constraint organisations_stripe_environment_allowed
      check (stripe_environment is null or stripe_environment in ('sandbox','live'));
  end if;
end $$;

create unique index if not exists organisations_stripe_customer_id_unique
  on public.organisations (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists organisations_stripe_subscription_id_unique
  on public.organisations (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Expand the existing protection trigger so community users cannot mark themselves
-- exempt, replace Stripe identifiers, or spoof payment state through the client API.
drop trigger if exists recordsweb_protect_organisation_billing_fields on public.organisations;
create trigger recordsweb_protect_organisation_billing_fields
before update of
  billing_plan,
  billing_status,
  billing_monthly_price,
  billing_first_month_price,
  billing_first_month_offer,
  billing_setup_fee,
  billing_start_date,
  billing_next_date,
  announcement_board_enabled,
  announcement_board_fee,
  billing_notes,
  billing_payment_exempt,
  billing_exemption_reason,
  billing_email,
  billing_setup_fee_paid_at,
  billing_first_month_offer_redeemed_at,
  announcement_board_paid_at,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_subscription_status,
  stripe_last_invoice_status,
  stripe_checkout_session_id,
  stripe_current_period_end,
  stripe_last_payment_at,
  stripe_environment,
  stripe_updated_at
on public.organisations
for each row
execute function public.recordsweb_protect_organisation_billing();

-- Platform Management needs the exemption and Stripe state in its community list.
drop function if exists public.recordsweb_operator_list_organisations();
create function public.recordsweb_operator_list_organisations()
returns table (
  id uuid,
  org_code text,
  name text,
  system_mode text,
  default_location text,
  active boolean,
  created_at timestamptz,
  has_reserved_operator boolean,
  billing_plan text,
  billing_status text,
  billing_monthly_price numeric,
  billing_first_month_price numeric,
  billing_first_month_offer boolean,
  billing_setup_fee numeric,
  billing_start_date date,
  billing_next_date date,
  announcement_board_enabled boolean,
  announcement_board_fee numeric,
  billing_notes text,
  billing_payment_exempt boolean,
  billing_exemption_reason text,
  billing_email text,
  billing_setup_fee_paid_at timestamptz,
  billing_first_month_offer_redeemed_at timestamptz,
  announcement_board_paid_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_status text,
  stripe_last_invoice_status text,
  stripe_checkout_session_id text,
  stripe_current_period_end timestamptz,
  stripe_last_payment_at timestamptz,
  stripe_environment text,
  stripe_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.recordsweb_is_platform_operator() then
    raise exception 'Access denied: RecordsWeb platform operator permission is required.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.org_code,
    o.name,
    o.system_mode,
    o.default_location,
    o.active,
    o.created_at,
    exists (
      select 1 from public.profiles p
      where p.organisation_id = o.id
        and p.active = true
        and lower(p.username) = lower('gus.farnsworth@' || o.org_code)
    ) as has_reserved_operator,
    o.billing_plan,
    o.billing_status,
    o.billing_monthly_price,
    o.billing_first_month_price,
    o.billing_first_month_offer,
    o.billing_setup_fee,
    o.billing_start_date,
    o.billing_next_date,
    o.announcement_board_enabled,
    o.announcement_board_fee,
    o.billing_notes,
    o.billing_payment_exempt,
    o.billing_exemption_reason,
    o.billing_email,
    o.billing_setup_fee_paid_at,
    o.billing_first_month_offer_redeemed_at,
    o.announcement_board_paid_at,
    o.stripe_customer_id,
    o.stripe_subscription_id,
    o.stripe_subscription_status,
    o.stripe_last_invoice_status,
    o.stripe_checkout_session_id,
    o.stripe_current_period_end,
    o.stripe_last_payment_at,
    o.stripe_environment,
    o.stripe_updated_at
  from public.organisations o
  order by lower(o.name), o.org_code;
end;
$$;

revoke all on function public.recordsweb_operator_list_organisations() from public;
grant execute on function public.recordsweb_operator_list_organisations() to authenticated;

commit;



-- ===========================================================================
-- RecordsWeb 3.2.7 billing grace/read-only enforcement
-- ===========================================================================
-- RecordsWeb 3.2.7 — billing grace period and read-only suspension
-- Run after recordsweb-3.2.6-stripe-billing.sql.
-- Failed subscription payments receive a 7-day grace period. After the grace
-- period, the organisation remains readable but writes are blocked until
-- billing is restored or Platform Management exempts the community from payment.

begin;

alter table public.organisations add column if not exists billing_grace_started_at timestamptz;
alter table public.organisations add column if not exists billing_grace_ends_at timestamptz;
alter table public.organisations add column if not exists billing_read_only_since timestamptz;

-- Existing overdue communities receive a fresh 7-day grace period when this
-- migration is installed, using the most recent Stripe update when available.
update public.organisations
set
  billing_grace_started_at = coalesce(billing_grace_started_at, stripe_updated_at, now()),
  billing_grace_ends_at = coalesce(billing_grace_ends_at, coalesce(stripe_updated_at, now()) + interval '7 days'),
  billing_read_only_since = null
where billing_status = 'overdue'
  and coalesce(billing_payment_exempt, false) = false;

-- Payment-exempt/complimentary organisations are never restricted.
update public.organisations
set
  billing_grace_started_at = null,
  billing_grace_ends_at = null,
  billing_read_only_since = null
where coalesce(billing_payment_exempt, false) = true
   or billing_status = 'complimentary';

-- Community users must not be able to spoof grace or suspension state.
drop trigger if exists recordsweb_protect_organisation_billing_fields on public.organisations;
create trigger recordsweb_protect_organisation_billing_fields
before update of
  billing_plan,
  billing_status,
  billing_monthly_price,
  billing_first_month_price,
  billing_first_month_offer,
  billing_setup_fee,
  billing_start_date,
  billing_next_date,
  announcement_board_enabled,
  announcement_board_fee,
  billing_notes,
  billing_payment_exempt,
  billing_exemption_reason,
  billing_email,
  billing_setup_fee_paid_at,
  billing_first_month_offer_redeemed_at,
  announcement_board_paid_at,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_subscription_status,
  stripe_last_invoice_status,
  stripe_checkout_session_id,
  stripe_current_period_end,
  stripe_last_payment_at,
  stripe_environment,
  stripe_updated_at,
  billing_grace_started_at,
  billing_grace_ends_at,
  billing_read_only_since
on public.organisations
for each row
execute function public.recordsweb_protect_organisation_billing();

-- Returns true when the signed-in organisation may change RecordsWeb data.
-- Reads remain available regardless of the result.
create or replace function public.recordsweb_billing_write_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      case
        when coalesce(o.billing_payment_exempt, false) then true
        when o.billing_status = 'complimentary' then true
        when o.billing_status = 'suspended' then false
        when o.billing_status = 'overdue'
          and o.billing_grace_ends_at is not null
          and now() >= o.billing_grace_ends_at then false
        else true
      end
    from public.organisations o
    where o.id = public.current_organisation_id()
  ), false);
$$;

revoke all on function public.recordsweb_billing_write_allowed() from public;
grant execute on function public.recordsweb_billing_write_allowed() to authenticated;

-- Refreshes the current organisation's stored billing status when its grace
-- period has elapsed. This is safe for the client to call because it can only
-- act on current_organisation_id().
create or replace function public.recordsweb_refresh_billing_access_state()
returns table (
  access_mode text,
  billing_status text,
  billing_payment_exempt boolean,
  billing_grace_started_at timestamptz,
  billing_grace_ends_at timestamptz,
  billing_read_only_since timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  v_org_id := public.current_organisation_id();
  if v_org_id is null then
    raise exception 'Unable to determine the current RecordsWeb organisation.' using errcode = '42501';
  end if;

  update public.organisations o
  set
    billing_status = 'suspended',
    billing_read_only_since = coalesce(o.billing_read_only_since, now()),
    stripe_updated_at = coalesce(o.stripe_updated_at, now())
  where o.id = v_org_id
    and coalesce(o.billing_payment_exempt, false) = false
    and o.billing_status = 'overdue'
    and o.billing_grace_ends_at is not null
    and now() >= o.billing_grace_ends_at;

  return query
  select
    case
      when coalesce(o.billing_payment_exempt, false) or o.billing_status = 'complimentary' then 'exempt'
      when o.billing_status = 'suspended' then 'read_only'
      when o.billing_status = 'overdue'
        and o.billing_grace_ends_at is not null
        and now() >= o.billing_grace_ends_at then 'read_only'
      when o.billing_status = 'overdue' then 'grace'
      else 'full'
    end as access_mode,
    o.billing_status,
    o.billing_payment_exempt,
    o.billing_grace_started_at,
    o.billing_grace_ends_at,
    o.billing_read_only_since
  from public.organisations o
  where o.id = v_org_id;
end;
$$;

revoke all on function public.recordsweb_refresh_billing_access_state() from public;
grant execute on function public.recordsweb_refresh_billing_access_state() to authenticated;

-- Database-side enforcement. Service-role/platform writes bypass this; signed-in
-- community users are blocked from INSERT/UPDATE/DELETE after the grace period.
create or replace function public.recordsweb_enforce_billing_write_access()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if not public.recordsweb_billing_write_allowed() then
    raise exception 'RecordsWeb is in read-only mode because the organisation subscription is suspended or its 7-day payment grace period has ended. Update billing to restore write access.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Apply the read-only guard to RecordsWeb data that represents clinical,
-- operational, staff-content or organisation configuration changes. Audit,
-- login/session tracking and message-read receipts remain writable.
do $$
declare
  t text;
begin
  foreach t in array array[
    'organisations',
    'patients',
    'problems',
    'medications',
    'consultations',
    'diary_tasks',
    'documents',
    'investigations',
    'referrals',
    'appointments',
    'staff_reports',
    'staff_jobs',
    'staff_notices',
    'organisation_notepad',
    'organisation_news',
    'fit_note_pdfs',
    'patient_alerts',
    'document_versions',
    'deleted_records'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists recordsweb_billing_write_guard on public.%I', t);
      execute format(
        'create trigger recordsweb_billing_write_guard before insert or update or delete on public.%I for each row execute function public.recordsweb_enforce_billing_write_access()',
        t
      );
    end if;
  end loop;
end $$;

-- Storage remains readable, but branding and clinical-document writes are also
-- denied after the grace period. Recreate only the existing multi-organisation
-- write policies; select/read policies are intentionally unchanged.
drop policy if exists "recordsweb_branding_management_insert" on storage.objects;
drop policy if exists "recordsweb_branding_management_update" on storage.objects;
drop policy if exists "recordsweb_branding_management_delete" on storage.objects;

create policy "recordsweb_branding_management_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and public.recordsweb_billing_write_allowed()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create policy "recordsweb_branding_management_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and public.recordsweb_billing_write_allowed()
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
)
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and public.recordsweb_billing_write_allowed()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create policy "recordsweb_branding_management_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and public.recordsweb_billing_write_allowed()
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
);

drop policy if exists "recordsweb_documents_insert" on storage.objects;
drop policy if exists "recordsweb_documents_update" on storage.objects;
drop policy if exists "recordsweb_documents_delete" on storage.objects;

create policy "recordsweb_documents_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-documents'
  and public.recordsweb_billing_write_allowed()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and public.recordsweb_billing_write_allowed()
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
)
with check (
  bucket_id = 'recordsweb-documents'
  and public.recordsweb_billing_write_allowed()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and public.recordsweb_billing_write_allowed()
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

commit;


-- RecordsWeb 3.2.8 medication/consultation workflow
-- RecordsWeb 3.2.8 — realistic medication workflow + consultation problem creation
-- Run after recordsweb-3.2.7-billing-grace-readonly.sql.
--
-- Adds:
--   * PDF-catalogue metadata on medication records
--   * specialist-drug GP Partner authorisation enforcement
--   * medication issue/history events
--   * cancel-course action with mandatory reason
--   * re-authorisation with prescribing PIN
--   * automatic Problems creation when a consultation records a new problem

begin;

alter table public.medications add column if not exists catalogue_id text;
alter table public.medications add column if not exists form text;
alter table public.medications add column if not exists indication text;
alter table public.medications add column if not exists reference_usual_dose text;
alter table public.medications add column if not exists reference_higher_dose text;
alter table public.medications add column if not exists specialist_only boolean not null default false;
alter table public.medications add column if not exists specialist_authorised_by uuid references public.profiles(id) on delete set null;
alter table public.medications add column if not exists specialist_authorised_at timestamptz;
alter table public.medications add column if not exists prescription_count integer not null default 1;
alter table public.medications add column if not exists cancelled_at timestamptz;
alter table public.medications add column if not exists cancellation_reason text;
alter table public.medications add column if not exists cancelled_by text;
alter table public.medications add column if not exists last_reauthorised_at timestamptz;
alter table public.medications add column if not exists last_reauthorised_by text;

update public.medications
set prescription_count = 1
where prescription_count is null or prescription_count < 1;

alter table public.consultations add column if not exists problem_id uuid references public.problems(id) on delete set null;

create table if not exists public.medication_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  medication_id uuid references public.medications(id) on delete cascade,
  medication_name text not null,
  event_type text not null,
  reason text,
  clinician_id uuid references public.profiles(id) on delete set null,
  clinician_name text,
  prescribing_pin_used boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint medication_events_type_allowed check (event_type in ('prescribed','updated','cancelled','reauthorised'))
);

create index if not exists medication_events_patient_name_idx
  on public.medication_events (patient_id, medication_name, created_at desc);
create index if not exists medication_events_medication_idx
  on public.medication_events (medication_id, created_at desc);

alter table public.medication_events enable row level security;

drop policy if exists "medication_events_read" on public.medication_events;
create policy "medication_events_read"
on public.medication_events for select to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = patient_id
      and p.organisation_id = public.current_organisation_id()
  )
);

-- History rows can only be generated by the secured prescribing functions.
revoke insert, update, delete on public.medication_events from authenticated, anon;
grant select on public.medication_events to authenticated;

-- Backfill one initial "prescribed" history entry for legacy medication rows.
insert into public.medication_events (
  patient_id,
  medication_id,
  medication_name,
  event_type,
  clinician_name,
  prescribing_pin_used,
  details,
  created_at
)
select
  m.patient_id,
  m.id,
  m.name,
  'prescribed',
  m.authoriser,
  false,
  jsonb_build_object('legacy_backfill', true),
  coalesce(m.created_at, now())
from public.medications m
where not exists (
  select 1 from public.medication_events e
  where e.medication_id = m.id
    and e.event_type = 'prescribed'
);

-- New table also participates in the 3.2.7 billing read-only guard.
do $$
begin
  if to_regprocedure('public.recordsweb_enforce_billing_write_access()') is not null then
    drop trigger if exists recordsweb_billing_write_guard on public.medication_events;
    create trigger recordsweb_billing_write_guard
      before insert or update or delete on public.medication_events
      for each row execute function public.recordsweb_enforce_billing_write_access();
  end if;
end $$;

-- Replace medication save RPC with catalogue metadata, specialist authorisation,
-- history logging, and an explicit billing write check.
create or replace function public.recordsweb_save_medication(
  p_patient_id uuid,
  p_medication_id uuid,
  p_payload jsonb,
  p_pin text
)
returns public.medications
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
  v_pin public.prescribing_pins%rowtype;
  v_med public.medications%rowtype;
  v_authoriser text;
  v_type text;
  v_name text;
  v_specialist boolean;
  v_is_gp_partner boolean;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if not public.recordsweb_billing_write_allowed() then
    raise exception 'RecordsWeb is in read-only mode because this organisation does not currently have write access.' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'Enter your 4-digit prescribing PIN.'; end if;

  select * into v_profile from public.profiles where id = auth.uid() and active = true;
  if not found then raise exception 'Your RecordsWeb profile is not active.'; end if;

  select * into v_pin from public.prescribing_pins where user_id = auth.uid();
  if not found then raise exception 'Create a prescribing PIN before authorising medication.'; end if;
  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then raise exception 'Prescribing PIN is incorrect.'; end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organisation_id = v_profile.organisation_id
  ) then raise exception 'Patient is not available to your organisation.'; end if;

  v_name := trim(coalesce(p_payload->>'name',''));
  if v_name = '' then raise exception 'Medication name is required.'; end if;
  if nullif(trim(coalesce(p_payload->>'catalogue_id','')), '') is null then
    raise exception 'Select the medicine from the RecordsWeb GP medicines reference before prescribing.';
  end if;

  v_type := coalesce(nullif(p_payload->>'type',''), 'Acute Meds');
  if v_type not in ('Acute Meds','Repeat','Long Term Meds') then raise exception 'Medication group is invalid.'; end if;

  v_specialist := coalesce((p_payload->>'specialist_only')::boolean, false);
  v_is_gp_partner := v_profile.role = 'GP Partner' or 'GP Partner' = any(coalesce(v_profile.roles, array[]::text[]));
  if v_specialist and not v_is_gp_partner then
    raise exception 'This drug is only allowed to be prescribed by specialists. Please speak to your GP Partner for authorisation to prescribe this drug.' using errcode = '42501';
  end if;

  v_authoriser := coalesce(
    nullif(trim(concat_ws(' ', v_profile.title, v_profile.first_name, v_profile.last_name)), ''),
    v_profile.display_name,
    v_profile.username
  );

  if p_medication_id is null then
    insert into public.medications (
      patient_id, name, dose, quantity, type, last_issue_date,
      authoriser, issues, method, usage, active,
      catalogue_id, form, indication, reference_usual_dose, reference_higher_dose,
      specialist_only, specialist_authorised_by, specialist_authorised_at,
      prescription_count
    ) values (
      p_patient_id,
      v_name,
      nullif(p_payload->>'dose',''),
      nullif(p_payload->>'quantity',''),
      v_type,
      coalesce(nullif(p_payload->>'last_issue_date','')::date, current_date),
      v_authoriser,
      nullif(p_payload->>'issues',''),
      nullif(p_payload->>'method',''),
      nullif(p_payload->>'usage',''),
      coalesce((p_payload->>'active')::boolean, true),
      nullif(p_payload->>'catalogue_id',''),
      nullif(p_payload->>'form',''),
      nullif(p_payload->>'indication',''),
      nullif(p_payload->>'reference_usual_dose',''),
      nullif(p_payload->>'reference_higher_dose',''),
      v_specialist,
      case when v_specialist then auth.uid() else null end,
      case when v_specialist then now() else null end,
      1
    ) returning * into v_med;

    insert into public.medication_events (
      patient_id, medication_id, medication_name, event_type,
      clinician_id, clinician_name, prescribing_pin_used, details
    ) values (
      p_patient_id, v_med.id, v_med.name, 'prescribed',
      auth.uid(), v_authoriser, true,
      jsonb_build_object(
        'dose', v_med.dose,
        'quantity', v_med.quantity,
        'catalogue_id', v_med.catalogue_id,
        'specialist_only', v_med.specialist_only
      )
    );
  else
    update public.medications m set
      name = v_name,
      dose = nullif(p_payload->>'dose',''),
      quantity = nullif(p_payload->>'quantity',''),
      type = v_type,
      last_issue_date = nullif(p_payload->>'last_issue_date','')::date,
      authoriser = v_authoriser,
      issues = nullif(p_payload->>'issues',''),
      method = nullif(p_payload->>'method',''),
      usage = nullif(p_payload->>'usage',''),
      active = coalesce((p_payload->>'active')::boolean, m.active),
      catalogue_id = nullif(p_payload->>'catalogue_id',''),
      form = nullif(p_payload->>'form',''),
      indication = nullif(p_payload->>'indication',''),
      reference_usual_dose = nullif(p_payload->>'reference_usual_dose',''),
      reference_higher_dose = nullif(p_payload->>'reference_higher_dose',''),
      specialist_only = v_specialist,
      specialist_authorised_by = case when v_specialist then auth.uid() else null end,
      specialist_authorised_at = case when v_specialist then now() else null end,
      updated_at = now()
    where m.id = p_medication_id and m.patient_id = p_patient_id
    returning * into v_med;
    if not found then raise exception 'Medication record was not found.'; end if;

    insert into public.medication_events (
      patient_id, medication_id, medication_name, event_type,
      clinician_id, clinician_name, prescribing_pin_used, details
    ) values (
      p_patient_id, v_med.id, v_med.name, 'updated',
      auth.uid(), v_authoriser, true,
      jsonb_build_object(
        'dose', v_med.dose,
        'quantity', v_med.quantity,
        'catalogue_id', v_med.catalogue_id,
        'specialist_only', v_med.specialist_only
      )
    );
  end if;

  return v_med;
end;
$$;

-- Cancel a course. Cancellation deliberately requires a reason, not the
-- prescribing PIN. The action remains attributable to the signed-in clinician.
create or replace function public.recordsweb_cancel_medication(
  p_patient_id uuid,
  p_medication_id uuid,
  p_reason text
)
returns public.medications
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
  v_med public.medications%rowtype;
  v_reason text;
  v_clinician text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if not public.recordsweb_billing_write_allowed() then
    raise exception 'RecordsWeb is in read-only mode because this organisation does not currently have write access.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = auth.uid() and active = true;
  if not found then raise exception 'Your RecordsWeb profile is not active.'; end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organisation_id = v_profile.organisation_id
  ) then raise exception 'Patient is not available to your organisation.'; end if;

  v_reason := trim(coalesce(p_reason, ''));
  if length(v_reason) < 3 then raise exception 'Enter a reason for cancelling this medication course.'; end if;

  v_clinician := coalesce(
    nullif(trim(concat_ws(' ', v_profile.title, v_profile.first_name, v_profile.last_name)), ''),
    v_profile.display_name,
    v_profile.username
  );

  update public.medications m set
    active = false,
    cancelled_at = now(),
    cancellation_reason = v_reason,
    cancelled_by = v_clinician,
    updated_at = now()
  where m.id = p_medication_id and m.patient_id = p_patient_id
  returning * into v_med;
  if not found then raise exception 'Medication record was not found.'; end if;

  insert into public.medication_events (
    patient_id, medication_id, medication_name, event_type,
    reason, clinician_id, clinician_name, prescribing_pin_used,
    details
  ) values (
    p_patient_id, v_med.id, v_med.name, 'cancelled',
    v_reason, auth.uid(), v_clinician, false,
    jsonb_build_object('prescription_count', v_med.prescription_count)
  );

  return v_med;
end;
$$;

-- Re-authorise a medicine. This requires the current clinician's prescribing PIN.
-- Specialist medicines additionally require the signed-in clinician to hold the
-- GP Partner role.
create or replace function public.recordsweb_reauthorise_medication(
  p_patient_id uuid,
  p_medication_id uuid,
  p_pin text
)
returns public.medications
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
  v_pin public.prescribing_pins%rowtype;
  v_med public.medications%rowtype;
  v_clinician text;
  v_is_gp_partner boolean;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if not public.recordsweb_billing_write_allowed() then
    raise exception 'RecordsWeb is in read-only mode because this organisation does not currently have write access.' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'Enter your 4-digit prescribing PIN.'; end if;

  select * into v_profile from public.profiles where id = auth.uid() and active = true;
  if not found then raise exception 'Your RecordsWeb profile is not active.'; end if;

  select * into v_pin from public.prescribing_pins where user_id = auth.uid();
  if not found then raise exception 'Create a prescribing PIN before re-authorising medication.'; end if;
  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then raise exception 'Prescribing PIN is incorrect.'; end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organisation_id = v_profile.organisation_id
  ) then raise exception 'Patient is not available to your organisation.'; end if;

  select * into v_med
  from public.medications m
  where m.id = p_medication_id and m.patient_id = p_patient_id;
  if not found then raise exception 'Medication record was not found.'; end if;

  v_is_gp_partner := v_profile.role = 'GP Partner' or 'GP Partner' = any(coalesce(v_profile.roles, array[]::text[]));
  if v_med.specialist_only and not v_is_gp_partner then
    raise exception 'This drug is only allowed to be prescribed by specialists. Please speak to your GP Partner for authorisation to prescribe this drug.' using errcode = '42501';
  end if;

  v_clinician := coalesce(
    nullif(trim(concat_ws(' ', v_profile.title, v_profile.first_name, v_profile.last_name)), ''),
    v_profile.display_name,
    v_profile.username
  );

  update public.medications m set
    active = true,
    last_issue_date = current_date,
    authoriser = v_clinician,
    prescription_count = greatest(coalesce(m.prescription_count, 1), 1) + 1,
    last_reauthorised_at = now(),
    last_reauthorised_by = v_clinician,
    cancelled_at = null,
    cancellation_reason = null,
    cancelled_by = null,
    specialist_authorised_by = case when m.specialist_only then auth.uid() else m.specialist_authorised_by end,
    specialist_authorised_at = case when m.specialist_only then now() else m.specialist_authorised_at end,
    updated_at = now()
  where m.id = p_medication_id and m.patient_id = p_patient_id
  returning * into v_med;

  insert into public.medication_events (
    patient_id, medication_id, medication_name, event_type,
    clinician_id, clinician_name, prescribing_pin_used, details
  ) values (
    p_patient_id, v_med.id, v_med.name, 'reauthorised',
    auth.uid(), v_clinician, true,
    jsonb_build_object(
      'prescription_count', v_med.prescription_count,
      'specialist_only', v_med.specialist_only
    )
  );

  return v_med;
end;
$$;

-- Transactional consultation creation. If the clinician enters a Problem but
-- does not select an existing one, RecordsWeb creates (or reuses) an active
-- Problems record and links the consultation to it.
create or replace function public.recordsweb_create_consultation_with_problem(
  p_patient_id uuid,
  p_payload jsonb,
  p_existing_problem_id uuid default null,
  p_new_problem_name text default null,
  p_new_problem_notes text default null,
  p_new_problem_significance text default null
)
returns public.consultations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_problem public.problems%rowtype;
  v_consultation public.consultations%rowtype;
  v_problem_name text;
  v_problem_notes text;
  v_problem_significance text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.recordsweb_billing_write_allowed() then
    raise exception 'RecordsWeb is in read-only mode because this organisation does not currently have write access.' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and active = true;

  if not found then
    raise exception 'Your RecordsWeb profile is not active.';
  end if;

  if not exists (
    select 1
    from public.patients p
    where p.id = p_patient_id
      and p.organisation_id = v_profile.organisation_id
  ) then
    raise exception 'Patient is not available to your organisation.';
  end if;

  if p_existing_problem_id is not null then
    select * into v_problem
    from public.problems p
    where p.id = p_existing_problem_id
      and p.patient_id = p_patient_id;

    if not found then
      raise exception 'The selected patient problem could not be found.';
    end if;
  else
    v_problem_name := left(trim(coalesce(p_new_problem_name, '')), 240);
    v_problem_notes := left(trim(coalesce(p_new_problem_notes, '')), 1000);
    v_problem_significance := left(trim(coalesce(p_new_problem_significance, '')), 40);

    if v_problem_name <> '' then
      select * into v_problem
      from public.problems p
      where p.patient_id = p_patient_id
        and lower(trim(p.name)) = lower(v_problem_name)
        and lower(coalesce(p.status, 'Active')) <> 'inactive'
      order by p.created_at desc
      limit 1;

      if not found then
        insert into public.problems (
          patient_id,
          name,
          onset_date,
          status,
          significance,
          notes
        ) values (
          p_patient_id,
          v_problem_name,
          current_date,
          'Active',
          coalesce(nullif(v_problem_significance, ''), 'Minor'),
          coalesce(nullif(v_problem_notes, ''), 'Created automatically from a RecordsWeb consultation.')
        )
        returning * into v_problem;
      end if;
    end if;
  end if;

  insert into public.consultations (
    patient_id,
    problem_id,
    date,
    clinician,
    location,
    type,
    status,
    entries
  ) values (
    p_patient_id,
    v_problem.id,
    coalesce(nullif(p_payload->>'date','')::timestamptz, now()),
    coalesce(nullif(p_payload->>'clinician',''), v_profile.display_name, v_profile.username),
    nullif(p_payload->>'location',''),
    nullif(p_payload->>'type',''),
    coalesce(nullif(p_payload->>'status',''), 'Complete'),
    coalesce(p_payload->'entries', '[]'::jsonb)
  )
  returning * into v_consultation;

  return v_consultation;
end;
$$;

revoke all on function public.recordsweb_create_consultation_with_problem(uuid, jsonb, uuid, text, text, text) from public, anon;
grant execute on function public.recordsweb_create_consultation_with_problem(uuid, jsonb, uuid, text, text, text) to authenticated;


-- Medication writes continue to be RPC-only so the PIN/specialist checks cannot
-- be bypassed with a direct client update.
revoke insert, update on public.medications from authenticated, anon;

commit;


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


-- RecordsWeb 3.3.5 - problem end dates.
alter table public.problems add column if not exists end_date date;

-- ================================================================
-- RecordsWeb 3.3.6 Shared Care Network
-- ================================================================

-- RecordsWeb 3.3.6 — Shared Care Network
-- Adds community-to-community linking, outbound sharing permissions, patient
-- record linking and secure cross-community patient snapshots.
-- Supports Primary Care, Secondary Care and Ambulance / PHEM communities.

begin;

create extension if not exists pgcrypto;

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
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(
        alphabet,
        (get_byte(gen_random_bytes(1), 0) % length(alphabet)) + 1,
        1
      );
    end loop;

    exit when not exists (
      select 1 from public.organisations o where o.shared_care_code = candidate
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

create policy "shared_care_link_participant_read"
on public.recordsweb_shared_care_links for select to authenticated
using (
  public.current_organisation_id() in (organisation_a_id, organisation_b_id)
);

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

commit;

-- RecordsWeb 3.4.0 — Discord Bot Integration
begin;
alter table public.profiles add column if not exists discord_user_id text;
do $$ begin
  alter table public.profiles add constraint profiles_discord_user_id_format
    check (discord_user_id is null or discord_user_id ~ '^[0-9]{17,20}$');
exception when duplicate_object then null; end $$;
create index if not exists profiles_discord_user_id_idx on public.profiles(discord_user_id) where discord_user_id is not null;
create table if not exists public.recordsweb_discord_integrations (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  guild_id text not null,
  guild_name text not null default '',
  channel_id text not null,
  channel_name text not null default '',
  maintenance_notifications boolean not null default true,
  login_dm_enabled boolean not null default true,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_by_name text not null default '',
  verified_at timestamptz,
  last_notification_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recordsweb_discord_integrations_guild_format check (guild_id ~ '^[0-9]{17,20}$'),
  constraint recordsweb_discord_integrations_channel_format check (channel_id ~ '^[0-9]{17,20}$')
);
create unique index if not exists recordsweb_discord_integrations_channel_unique_idx on public.recordsweb_discord_integrations(guild_id, channel_id);
alter table public.recordsweb_discord_integrations enable row level security;
revoke all on table public.recordsweb_discord_integrations from anon;
revoke all on table public.recordsweb_discord_integrations from authenticated;
grant all on table public.recordsweb_discord_integrations to service_role;
commit;
