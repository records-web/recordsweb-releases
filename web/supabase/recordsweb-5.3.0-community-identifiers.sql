-- RecordsWeb 5.3.0 — alphanumeric XX.XX community identifiers + dedicated subdomains
--
-- New communities are allocated a unique four-character RecordsWeb organisation
-- code in the existing two-by-two format. Each character can be A-Z or 0-9,
-- for example GW.HS or UH.S1. The dedicated web portal uses a DNS-safe hyphen:
-- GW.HS -> gw-hs.recordsweb.org, UH.S1 -> uh-s1.recordsweb.org.

begin;

alter table public.organisations
  drop constraint if exists organisations_org_code_format;

alter table public.organisations
  add constraint organisations_org_code_format
  check (org_code ~ '^[A-Z0-9]{2}\.[A-Z0-9]{2}$');

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
  if new.name = '' then
    raise exception 'Organisation name is required.';
  end if;
  if new.system_mode not in ('general_practice', 'hospital', 'ambulance', 'policing') then
    raise exception 'RecordsWeb mode must be general_practice, hospital, ambulance or policing.';
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

drop function if exists public.recordsweb_public_organisation_config(text);
create function public.recordsweb_public_organisation_config(
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
  logo_updated_at timestamptz,
  default_interface_style text
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
  if v_code !~ '^[A-Z0-9]{2}\.[A-Z0-9]{2}$' then
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
    o.logo_updated_at,
    o.default_interface_style
  from public.organisations o
  where o.org_code = v_code
  limit 1;
end;
$$;

revoke all on function public.recordsweb_public_organisation_config(text) from public;
grant execute on function public.recordsweb_public_organisation_config(text) to anon, authenticated;

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
  if v_code !~ '^[A-Z0-9]{2}\.[A-Z0-9]{2}$' then return; end if;

  return query
  select
    o.id,
    o.product_package,
    case when o.tester_program then array['clinical','policing']::text[] else o.enabled_products end,
    o.tester_program
  from public.organisations o
  where o.org_code = v_code and o.active = true
  limit 1;
end;
$$;

revoke all on function public.recordsweb_public_product_entitlements(text) from public;
grant execute on function public.recordsweb_public_product_entitlements(text) to anon, authenticated;

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

  if v_code !~ '^[A-Z0-9]{2}\.[A-Z0-9]{2}$' then
    raise exception 'Organisation code must use the RecordsWeb format @XX.XX with letters or numbers.';
  end if;
  if v_name = '' then raise exception 'Organisation name is required.'; end if;
  if v_mode not in ('general_practice', 'hospital', 'ambulance', 'policing') then
    raise exception 'RecordsWeb mode must be general_practice, hospital, ambulance or policing.';
  end if;
  if v_location = '' then v_location := 'Main Site'; end if;

  insert into public.organisations (org_code, name, system_mode, default_location, active)
  values (v_code, v_name, v_mode, v_location, true)
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

-- Platform/reviewer access is keyed from the RecordsWeb profile username rather
-- than the Supabase Auth email. This keeps @UH.S1 visible while allowing the
-- Auth layer to use an internal recordsweb.org alias where a digit-containing
-- organisation suffix needs one.
create or replace function public.recordsweb_is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      lower(trim(coalesce(p.username, ''))) ~ '^(gus[.]farnsworth|alfie[.]james)@[a-z0-9]{2}[.][a-z0-9]{2}$'
      and lower(split_part(p.username, '@', 2)) = lower(o.org_code)
      and p.active = true
      and o.active = true
    from public.profiles p
    join public.organisations o on o.id = p.organisation_id
    where p.id = auth.uid()
    limit 1
  ), false);
$$;

revoke all on function public.recordsweb_is_platform_operator() from public;
grant execute on function public.recordsweb_is_platform_operator() to authenticated;

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

commit;
