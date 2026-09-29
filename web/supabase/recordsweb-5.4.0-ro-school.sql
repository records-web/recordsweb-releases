-- RecordsWeb 5.4.0 — Ro-School organisation type, product and register system
-- Adds school/education communities, school staff roles, pupil/class/timetable data
-- and AM/PM/lesson registers. Ro-School is intended for simulation/roleplay use.

begin;

-- ---------------------------------------------------------------------------
-- Organisation/product entitlement support
-- ---------------------------------------------------------------------------

alter table public.organisations drop constraint if exists organisations_system_mode_allowed;
alter table public.organisations add constraint organisations_system_mode_allowed
  check (system_mode in ('general_practice', 'hospital', 'ambulance', 'policing', 'school'));

alter table public.organisations drop constraint if exists organisations_product_package_allowed;
alter table public.organisations add constraint organisations_product_package_allowed
  check (product_package in ('clinical','policing','school','complete','custom'));

alter table public.organisations drop constraint if exists organisations_enabled_products_allowed;
alter table public.organisations add constraint organisations_enabled_products_allowed
  check (
    coalesce(array_length(enabled_products, 1), 0) >= 1
    and enabled_products <@ array['clinical','policing','school']::text[]
  );

-- Complete and Tester Programme communities receive every current RecordsWeb product.
update public.organisations
set enabled_products = array['clinical','policing','school']::text[]
where product_package = 'complete' or tester_program = true;

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

  if new.org_code !~ '^[A-Z0-9]{2}\.[A-Z0-9]{2}$' then
    raise exception 'Organisation code must use the RecordsWeb format @XX.XX with letters or numbers.';
  end if;
  if new.name = '' then raise exception 'Organisation name is required.'; end if;
  if new.system_mode not in ('general_practice', 'hospital', 'ambulance', 'policing', 'school') then
    raise exception 'RecordsWeb mode must be general_practice, hospital, ambulance, policing or school.';
  end if;
  if new.default_location = '' then new.default_location := 'Main Site'; end if;
  if new.shared_care_code is null or new.shared_care_code !~ '^[A-Z0-9]{6}$' then
    new.shared_care_code := public.recordsweb_generate_shared_care_code();
  end if;
  return new;
end;
$$;

drop function if exists public.recordsweb_public_product_entitlements(text);
create function public.recordsweb_public_product_entitlements(p_organisation_code text)
returns table (
  organisation_id uuid,
  product_package text,
  enabled_products text[],
  tester_program boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_code text;
begin
  v_code := upper(regexp_replace(trim(coalesce(p_organisation_code, '')), '^@+', ''));
  if v_code !~ '^[A-Z0-9]{2}\.[A-Z0-9]{2}$' then return; end if;
  return query
  select o.id, o.product_package,
         case when o.tester_program then array['clinical','policing','school']::text[] else o.enabled_products end,
         o.tester_program
  from public.organisations o
  where o.org_code = v_code and o.active = true
  limit 1;
end;
$$;
revoke all on function public.recordsweb_public_product_entitlements(text) from public;
grant execute on function public.recordsweb_public_product_entitlements(text) to anon, authenticated;

create or replace function public.recordsweb_operator_list_product_entitlements()
returns table (
  id uuid,
  product_package text,
  enabled_products text[],
  tester_program boolean,
  tester_since timestamptz,
  tester_notes text
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
  select o.id, o.product_package,
         case when o.tester_program then array['clinical','policing','school']::text[] else o.enabled_products end,
         o.tester_program, o.tester_since, o.tester_notes
  from public.organisations o
  order by lower(o.name), o.org_code;
end;
$$;
revoke all on function public.recordsweb_operator_list_product_entitlements() from public;
grant execute on function public.recordsweb_operator_list_product_entitlements() to authenticated;

create or replace function public.recordsweb_current_has_product(p_product text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select o.active and (
      o.tester_program
      or lower(trim(coalesce(p_product, ''))) = any(o.enabled_products)
    )
    from public.organisations o
    where o.id = public.current_organisation_id()
  ), false);
$$;
revoke all on function public.recordsweb_current_has_product(text) from public;
grant execute on function public.recordsweb_current_has_product(text) to authenticated;

-- ---------------------------------------------------------------------------
-- School staff roles
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_allowed;
alter table public.profiles drop constraint if exists profiles_roles_allowed;

alter table public.profiles add constraint profiles_role_allowed check (role in (
  'GP Partner','Practice Manager','Assistant Manager','General Practitioner','GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse','Advanced Clinical Practitioner','Clinical Pharmacist','General Practice Nurse','Nurse Associate','Healthcare Assistant','Patient Coordinator',
  'Chief Executive Officer','Deputy Chief Executive Officer','Chief Operations Officer','Medical Director','Director of Nursing','Consultant','Registrar (ST4-ST9)','Charge Nurse','Staff Nurse',
  'PHEM Consultant','PHEM Doctor','Critical Care Paramedic','Advanced Paramedic','Paramedic','Emergency Medical Technician','Emergency Care Assistant','Dispatcher','Clinical Team Leader','Operations Manager',
  'Chief Constable','Deputy Chief Constable','Assistant Chief Constable','Chief Superintendent','Superintendent','Chief Inspector','Inspector','Sergeant','Police Constable','Detective Chief Superintendent','Detective Superintendent','Detective Chief Inspector','Detective Inspector','Detective Sergeant','Detective Constable','Special Constable','Police Community Support Officer','Custody Sergeant','Detention Officer','Control Room Operator','Police Staff',
  'Headteacher','Deputy Headteacher','Assistant Headteacher','Head of Year','Head of Department','Teacher','Cover Supervisor','Teaching Assistant','SENCO','Designated Safeguarding Lead','Pastoral Manager','Attendance Officer','Examinations Officer','Data Manager','School Business Manager','Reception / Office Staff'
));

alter table public.profiles add constraint profiles_roles_allowed check (
  cardinality(roles) >= 1
  and roles <@ array[
    'GP Partner','Practice Manager','Assistant Manager','General Practitioner','GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse','Advanced Clinical Practitioner','Clinical Pharmacist','General Practice Nurse','Nurse Associate','Healthcare Assistant','Patient Coordinator',
    'Chief Executive Officer','Deputy Chief Executive Officer','Chief Operations Officer','Medical Director','Director of Nursing','Consultant','Registrar (ST4-ST9)','Charge Nurse','Staff Nurse',
    'PHEM Consultant','PHEM Doctor','Critical Care Paramedic','Advanced Paramedic','Paramedic','Emergency Medical Technician','Emergency Care Assistant','Dispatcher','Clinical Team Leader','Operations Manager',
    'Chief Constable','Deputy Chief Constable','Assistant Chief Constable','Chief Superintendent','Superintendent','Chief Inspector','Inspector','Sergeant','Police Constable','Detective Chief Superintendent','Detective Superintendent','Detective Chief Inspector','Detective Inspector','Detective Sergeant','Detective Constable','Special Constable','Police Community Support Officer','Custody Sergeant','Detention Officer','Control Room Operator','Police Staff',
    'Headteacher','Deputy Headteacher','Assistant Headteacher','Head of Year','Head of Department','Teacher','Cover Supervisor','Teaching Assistant','SENCO','Designated Safeguarding Lead','Pastoral Manager','Attendance Officer','Examinations Officer','Data Manager','School Business Manager','Reception / Office Staff'
  ]::text[]
);


-- Public access requests can explicitly request a Ro-School organisation.
alter table if exists public.recordsweb_access_requests
  drop constraint if exists recordsweb_access_requests_mode;

alter table if exists public.recordsweb_access_requests
  add constraint recordsweb_access_requests_mode
  check (requested_mode in ('general_practice','hospital','ambulance','policing','school'));

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
  if v_mode not in ('general_practice','hospital','ambulance','policing','school') then raise exception 'Invalid RecordsWeb mode.'; end if;
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

-- Keep the service-role provisioning helper aware of Ro-School. Platform
-- Management normally creates communities through recordsweb-platform-admin,
-- but this helper remains supported for automated provisioning.
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
  v_package text;
  v_products text[];
  v_org public.organisations%rowtype;
begin
  v_code := upper(regexp_replace(trim(coalesce(p_org_code, '')), '^@+', ''));
  v_mode := lower(trim(coalesce(p_system_mode, 'general_practice')));
  v_name := trim(coalesce(p_name, ''));
  v_location := trim(coalesce(p_default_location, 'Main Site'));

  if v_code !~ '^[A-Z0-9]{2}\.[A-Z0-9]{2}$' then
    raise exception 'Organisation code must use the RecordsWeb format @XX.XX with letters or numbers.';
  end if;
  if v_name = '' then raise exception 'Organisation name is required.'; end if;
  if v_mode not in ('general_practice', 'hospital', 'ambulance', 'policing', 'school') then
    raise exception 'RecordsWeb mode must be general_practice, hospital, ambulance, policing or school.';
  end if;
  if v_location = '' then v_location := 'Main Site'; end if;

  v_package := case when v_mode = 'policing' then 'policing' when v_mode = 'school' then 'school' else 'clinical' end;
  v_products := array[v_package]::text[];

  insert into public.organisations (org_code, name, system_mode, default_location, active, product_package, enabled_products)
  values (v_code, v_name, v_mode, v_location, true, v_package, v_products)
  on conflict (org_code) do update set
    name = excluded.name,
    system_mode = excluded.system_mode,
    default_location = excluded.default_location,
    active = true,
    product_package = excluded.product_package,
    enabled_products = excluded.enabled_products
  returning * into v_org;

  insert into public.system_maintenance (organisation_code, organisation_id)
  values (v_org.org_code, v_org.id)
  on conflict (organisation_code) do update
  set organisation_id = excluded.organisation_id;

  return v_org;
end;
$$;

revoke all on function public.recordsweb_provision_organisation(text, text, text, text) from public, anon, authenticated;
grant execute on function public.recordsweb_provision_organisation(text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Ro-School operational data
-- ---------------------------------------------------------------------------

create or replace function public.recordsweb_school_reference(p_prefix text)
returns text
language sql
volatile
set search_path = public
as $$
  select upper(regexp_replace(coalesce(nullif(trim(p_prefix), ''), 'PUP'), '[^A-Za-z0-9]', '', 'g'))
    || '-' || to_char(clock_timestamp(), 'YYYY') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create table if not exists public.school_pupils (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  admission_number text not null default public.recordsweb_school_reference('PUP'),
  first_name text not null,
  last_name text not null,
  preferred_name text,
  dob date,
  year_group text not null default '',
  form_group text not null default '',
  house text,
  pronouns text,
  status text not null default 'active' check (status in ('active','left')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, admission_number)
);

create table if not exists public.school_classes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  code text not null,
  name text not null,
  class_type text not null default 'lesson' check (class_type in ('lesson','form','club')),
  subject text,
  year_group text,
  room text,
  teacher_name text,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, code)
);

create table if not exists public.school_class_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  class_id uuid not null references public.school_classes(id) on delete cascade,
  pupil_id uuid not null references public.school_pupils(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, pupil_id)
);

create table if not exists public.school_registers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  register_date date not null default current_date,
  session_type text not null check (session_type in ('AM','PM','LESSON')),
  class_id uuid references public.school_classes(id) on delete set null,
  form_group text not null default '',
  period_label text not null default '',
  status text not null default 'open' check (status in ('open','completed')),
  taken_by uuid default auth.uid(),
  taken_by_name text,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists school_registers_scope_uidx
  on public.school_registers (
    organisation_id,
    register_date,
    session_type,
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    form_group,
    period_label
  );

create table if not exists public.school_register_marks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  register_id uuid not null references public.school_registers(id) on delete cascade,
  pupil_id uuid not null references public.school_pupils(id) on delete cascade,
  mark_code text not null default 'N' check (mark_code in ('P','L','I','M','C','R','E','N','O','X')),
  minutes_late integer not null default 0 check (minutes_late between 0 and 240),
  note text,
  marked_by uuid default auth.uid(),
  marked_at timestamptz not null default now(),
  unique (register_id, pupil_id)
);

create table if not exists public.school_timetable_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  weekday integer not null check (weekday between 1 and 5),
  period_number integer not null check (period_number between 1 and 12),
  period_label text not null default '',
  start_time time,
  end_time time,
  class_id uuid references public.school_classes(id) on delete cascade,
  room text,
  staff_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Keep organisation_id aligned with the parent class/register even if a client
-- omits it and protect cross-organisation references.

create or replace function public.recordsweb_school_class_scope()
returns trigger language plpgsql set search_path = public as $$
declare v_class_org uuid;
begin
  if new.class_id is null then
    return new;
  end if;
  select organisation_id into v_class_org from public.school_classes where id = new.class_id;
  if v_class_org is null then raise exception 'The selected Ro-School class does not exist.'; end if;
  if new.organisation_id is not null and new.organisation_id <> v_class_org then
    raise exception 'The selected Ro-School class belongs to a different organisation.';
  end if;
  new.organisation_id := v_class_org;
  return new;
end; $$;

drop trigger if exists trg_school_register_class_scope on public.school_registers;
create trigger trg_school_register_class_scope before insert or update on public.school_registers for each row execute function public.recordsweb_school_class_scope();

drop trigger if exists trg_school_timetable_class_scope on public.school_timetable_entries;
create trigger trg_school_timetable_class_scope before insert or update on public.school_timetable_entries for each row execute function public.recordsweb_school_class_scope();

create or replace function public.recordsweb_school_member_scope()
returns trigger language plpgsql set search_path = public as $$
declare v_class_org uuid; v_pupil_org uuid;
begin
  select organisation_id into v_class_org from public.school_classes where id = new.class_id;
  select organisation_id into v_pupil_org from public.school_pupils where id = new.pupil_id;
  if v_class_org is null or v_pupil_org is null or v_class_org <> v_pupil_org then raise exception 'Class and pupil must belong to the same RecordsWeb organisation.'; end if;
  new.organisation_id := v_class_org; return new;
end; $$;

drop trigger if exists trg_school_class_member_scope on public.school_class_members;
create trigger trg_school_class_member_scope before insert or update on public.school_class_members for each row execute function public.recordsweb_school_member_scope();

create or replace function public.recordsweb_school_mark_scope()
returns trigger language plpgsql set search_path = public as $$
declare v_register_org uuid; v_pupil_org uuid;
begin
  select organisation_id into v_register_org from public.school_registers where id = new.register_id;
  select organisation_id into v_pupil_org from public.school_pupils where id = new.pupil_id;
  if v_register_org is null or v_pupil_org is null or v_register_org <> v_pupil_org then raise exception 'Register and pupil must belong to the same RecordsWeb organisation.'; end if;
  new.organisation_id := v_register_org; new.marked_by := coalesce(auth.uid(), new.marked_by); new.marked_at := now(); return new;
end; $$;

drop trigger if exists trg_school_register_mark_scope on public.school_register_marks;
create trigger trg_school_register_mark_scope before insert or update on public.school_register_marks for each row execute function public.recordsweb_school_mark_scope();

do $$
declare t text;
begin
  foreach t in array array['school_pupils','school_classes','school_registers'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.recordsweb_touch_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

alter table public.school_pupils enable row level security;
alter table public.school_classes enable row level security;
alter table public.school_class_members enable row level security;
alter table public.school_registers enable row level security;
alter table public.school_register_marks enable row level security;
alter table public.school_timetable_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['school_pupils','school_classes','school_class_members','school_registers','school_register_marks','school_timetable_entries'] loop
    execute format('drop policy if exists %I on public.%I', t || '_rw540_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_rw540_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_rw540_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_rw540_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (organisation_id = public.current_organisation_id() and public.recordsweb_current_has_product(''school''))', t || '_rw540_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (organisation_id = public.current_organisation_id() and public.recordsweb_current_has_product(''school''))', t || '_rw540_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (organisation_id = public.current_organisation_id() and public.recordsweb_current_has_product(''school'')) with check (organisation_id = public.current_organisation_id() and public.recordsweb_current_has_product(''school''))', t || '_rw540_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (organisation_id = public.current_organisation_id() and public.recordsweb_current_has_product(''school''))', t || '_rw540_delete', t);
  end loop;
end $$;

commit;
