-- RecordsWeb 5.0.0 — multi-product platform + RecordsWeb Policing
-- Existing organisations remain Clinical by default.

begin;

alter table public.organisations
  add column if not exists product_package text not null default 'clinical',
  add column if not exists enabled_products text[] not null default array['clinical']::text[],
  add column if not exists tester_program boolean not null default false,
  add column if not exists tester_since timestamptz,
  add column if not exists tester_notes text;

update public.organisations
set product_package = coalesce(nullif(lower(trim(product_package)), ''), 'clinical'),
    enabled_products = case
      when tester_program then array['clinical','policing']::text[]
      when coalesce(array_length(enabled_products, 1), 0) = 0 then array['clinical']::text[]
      else enabled_products
    end;

alter table public.organisations drop constraint if exists organisations_product_package_allowed;
alter table public.organisations add constraint organisations_product_package_allowed
  check (product_package in ('clinical','policing','complete','custom'));

alter table public.organisations drop constraint if exists organisations_enabled_products_allowed;
alter table public.organisations add constraint organisations_enabled_products_allowed
  check (
    coalesce(array_length(enabled_products, 1), 0) >= 1
    and enabled_products <@ array['clinical','policing']::text[]
  );

comment on column public.organisations.product_package is 'RecordsWeb commercial/product bundle: clinical, policing, complete or custom.';
comment on column public.organisations.enabled_products is 'Explicit RecordsWeb products enabled for the organisation.';
comment on column public.organisations.tester_program is 'RecordsWeb Tester Programme members receive all current products.';

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
declare
  v_code text;
begin
  v_code := upper(regexp_replace(trim(coalesce(p_organisation_code, '')), '^@+', ''));
  if v_code !~ '^[A-Z]{2}\.[A-Z]{2}$' then return; end if;
  return query
  select o.id, o.product_package,
         case when o.tester_program then array['clinical','policing']::text[] else o.enabled_products end,
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
         case when o.tester_program then array['clinical','policing']::text[] else o.enabled_products end,
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

create or replace function public.recordsweb_police_reference(p_prefix text)
returns text
language sql
volatile
set search_path = public
as $$
  select upper(regexp_replace(coalesce(nullif(trim(p_prefix), ''), 'REC'), '[^A-Za-z0-9]', '', 'g'))
    || '-' || to_char(clock_timestamp(), 'YYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create or replace function public.recordsweb_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.police_persons (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  reference text not null default public.recordsweb_police_reference('PER'),
  first_name text not null,
  last_name text not null,
  dob date,
  address text,
  phone text,
  markers text[] not null default '{}'::text[],
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, reference)
);

create table if not exists public.police_vehicles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  reference text not null default public.recordsweb_police_reference('VEH'),
  registration text not null,
  make text,
  model text,
  colour text,
  status text not null default 'active',
  owner_person_id uuid references public.police_persons(id) on delete set null,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, reference)
);

create unique index if not exists police_vehicles_org_registration_uidx
  on public.police_vehicles(organisation_id, upper(registration));

create table if not exists public.police_incidents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  reference text not null default public.recordsweb_police_reference('INC'),
  title text not null,
  incident_type text not null default 'general',
  status text not null default 'open',
  priority text not null default 'standard',
  location text,
  occurred_at timestamptz not null default now(),
  person_id uuid references public.police_persons(id) on delete set null,
  vehicle_id uuid references public.police_vehicles(id) on delete set null,
  summary text not null default '',
  officer_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, reference)
);

create table if not exists public.police_fpns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  reference text not null default public.recordsweb_police_reference('FPN'),
  person_id uuid references public.police_persons(id) on delete set null,
  vehicle_id uuid references public.police_vehicles(id) on delete set null,
  offence text not null,
  location text,
  issued_at timestamptz not null default now(),
  penalty_amount numeric(10,2) not null default 0 check (penalty_amount >= 0),
  points integer not null default 0 check (points between 0 and 12),
  officer_name text,
  status text not null default 'issued',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, reference)
);

create table if not exists public.police_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_organisation_id() references public.organisations(id) on delete cascade,
  reference text not null default public.recordsweb_police_reference('REC'),
  record_type text not null,
  title text not null,
  person_id uuid references public.police_persons(id) on delete set null,
  vehicle_id uuid references public.police_vehicles(id) on delete set null,
  incident_id uuid references public.police_incidents(id) on delete set null,
  status text not null default 'open',
  details text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, reference),
  constraint police_records_type_allowed check (record_type in ('crime_report','intelligence','statement','evidence','arrest','warrant','seizure','custody','bolo','briefing','dispatch'))
);

create index if not exists police_persons_org_name_idx on public.police_persons(organisation_id, lower(last_name), lower(first_name));
create index if not exists police_incidents_org_status_idx on public.police_incidents(organisation_id, status, occurred_at desc);
create index if not exists police_fpns_org_date_idx on public.police_fpns(organisation_id, issued_at desc);
create index if not exists police_records_org_type_idx on public.police_records(organisation_id, record_type, occurred_at desc);

-- Prevent forged organisation/author values and cross-organisation links.
create or replace function public.recordsweb_police_integrity_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_org uuid;
  v_data jsonb;
  v_person_id uuid;
  v_vehicle_id uuid;
  v_incident_id uuid;
begin
  if auth.uid() is not null then
    v_current_org := public.current_organisation_id();
    if v_current_org is null then
      raise exception 'RecordsWeb organisation context is required.' using errcode = '42501';
    end if;
    new.organisation_id := v_current_org;
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    else
      new.created_by := old.created_by;
    end if;
  elsif tg_op = 'UPDATE' then
    new.organisation_id := old.organisation_id;
    new.created_by := old.created_by;
  end if;

  v_data := to_jsonb(new);
  v_person_id := nullif(coalesce(v_data->>'person_id', v_data->>'owner_person_id'), '')::uuid;
  v_vehicle_id := nullif(v_data->>'vehicle_id', '')::uuid;
  v_incident_id := nullif(v_data->>'incident_id', '')::uuid;

  if v_person_id is not null and not exists (select 1 from public.police_persons p where p.id = v_person_id and p.organisation_id = new.organisation_id) then
    raise exception 'Linked person does not belong to this RecordsWeb organisation.' using errcode = '42501';
  end if;
  if v_vehicle_id is not null and not exists (select 1 from public.police_vehicles v where v.id = v_vehicle_id and v.organisation_id = new.organisation_id) then
    raise exception 'Linked vehicle does not belong to this RecordsWeb organisation.' using errcode = '42501';
  end if;
  if v_incident_id is not null and not exists (select 1 from public.police_incidents i where i.id = v_incident_id and i.organisation_id = new.organisation_id) then
    raise exception 'Linked incident does not belong to this RecordsWeb organisation.' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['police_persons','police_vehicles','police_incidents','police_fpns','police_records'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_integrity_guard', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.recordsweb_police_integrity_guard()', t || '_integrity_guard', t);
  end loop;
end $$;

alter table public.police_persons enable row level security;
alter table public.police_vehicles enable row level security;
alter table public.police_incidents enable row level security;
alter table public.police_fpns enable row level security;
alter table public.police_records enable row level security;

-- Policing data is isolated by organisation and requires the Policing entitlement.
do $$
declare t text;
begin
  foreach t in array array['police_persons','police_vehicles','police_incidents','police_fpns','police_records'] loop
    execute format('drop policy if exists %I on public.%I', t || '_rw5_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_rw5_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_rw5_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_rw5_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (organisation_id = public.current_organisation_id() and public.recordsweb_current_has_product(''policing''))', t || '_rw5_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (organisation_id = public.current_organisation_id() and public.recordsweb_current_has_product(''policing''))', t || '_rw5_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (organisation_id = public.current_organisation_id() and public.recordsweb_current_has_product(''policing'')) with check (organisation_id = public.current_organisation_id() and public.recordsweb_current_has_product(''policing''))', t || '_rw5_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (organisation_id = public.current_organisation_id() and public.recordsweb_current_has_product(''policing''))', t || '_rw5_delete', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- updated_at maintenance
do $$
declare t text;
begin
  foreach t in array array['police_persons','police_vehicles','police_incidents','police_fpns','police_records'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.recordsweb_touch_updated_at()', t || '_touch_updated_at', t);
  end loop;
end $$;

-- Reuse the existing RecordsWeb billing write guard when available.
do $$
declare t text;
begin
  if to_regprocedure('public.recordsweb_enforce_billing_write_access()') is not null then
    foreach t in array array['police_persons','police_vehicles','police_incidents','police_fpns','police_records'] loop
      execute format('drop trigger if exists %I on public.%I', t || '_billing_guard', t);
      execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.recordsweb_enforce_billing_write_access()', t || '_billing_guard', t);
    end loop;
  end if;
end $$;

commit;
