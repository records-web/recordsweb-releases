-- RecordsWeb 3.4.4 — Ambulance / PHEM organisation-mode compatibility fix
-- Run once in the Supabase SQL Editor for an existing RecordsWeb database.
-- This removes the legacy GP/Hospital-only validation left by older migrations.

begin;

alter table public.organisations
  drop constraint if exists organisations_system_mode_allowed;

alter table public.organisations
  add constraint organisations_system_mode_allowed
  check (system_mode in ('general_practice', 'hospital', 'ambulance'));

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

  return new;
end;
$$;

drop trigger if exists recordsweb_normalise_organisation on public.organisations;
create trigger recordsweb_normalise_organisation
before insert or update of org_code, name, system_mode, default_location
on public.organisations
for each row execute function public.recordsweb_normalise_organisation();

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
  if v_mode not in ('general_practice', 'hospital', 'ambulance') then
    raise exception 'RecordsWeb mode must be general_practice, hospital or ambulance.';
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

revoke all on function public.recordsweb_provision_organisation(text, text, text, text) from public, anon, authenticated;
grant execute on function public.recordsweb_provision_organisation(text, text, text, text) to service_role;

commit;
