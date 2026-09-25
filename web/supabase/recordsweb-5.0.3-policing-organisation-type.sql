-- RecordsWeb 5.0.3 — Policing organisation type
-- Makes policing a first-class organisation system_mode without adding it to
-- Clinical Shared Care care_mode constraints.

begin;

alter table public.organisations
  drop constraint if exists organisations_system_mode_allowed;

alter table public.organisations
  add constraint organisations_system_mode_allowed
  check (system_mode in ('general_practice', 'hospital', 'ambulance', 'policing'));

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

-- Public community requests may also explicitly request a Policing organisation.
alter table if exists public.recordsweb_access_requests
  drop constraint if exists recordsweb_access_requests_mode;

alter table if exists public.recordsweb_access_requests
  add constraint recordsweb_access_requests_mode
  check (requested_mode in ('general_practice','hospital','ambulance','policing'));

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
  if v_mode not in ('general_practice','hospital','ambulance','policing') then raise exception 'Invalid RecordsWeb mode.'; end if;
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
