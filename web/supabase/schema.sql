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
