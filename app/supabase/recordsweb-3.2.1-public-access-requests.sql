-- RecordsWeb 3.2.1 — public website access requests
-- Run after recordsweb-3.2.0-multi-organisation.sql.

begin;

create extension if not exists pgcrypto;

create table if not exists public.recordsweb_access_requests (
  id uuid primary key default gen_random_uuid(),
  community_name text not null,
  requested_mode text not null default 'general_practice',
  discord_url text not null,
  roblox_group_url text not null,
  member_range text not null,
  contact_name text not null,
  contact_email text not null,
  discord_username text,
  logo_path text,
  additional_details text,
  authorised_contact boolean not null default false,
  status text not null default 'pending',
  operator_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recordsweb_access_requests_mode check (requested_mode in ('general_practice','hospital')),
  constraint recordsweb_access_requests_members check (member_range in ('10-99','100-999','1000-9999','10000+')),
  constraint recordsweb_access_requests_status check (status in ('pending','reviewing','approved','declined')),
  constraint recordsweb_access_requests_community_length check (char_length(trim(community_name)) between 2 and 120),
  constraint recordsweb_access_requests_contact_length check (char_length(trim(contact_name)) between 2 and 120)
);

alter table public.recordsweb_access_requests enable row level security;
revoke all on table public.recordsweb_access_requests from anon, authenticated;

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
  if v_mode not in ('general_practice','hospital') then raise exception 'Invalid RecordsWeb mode.'; end if;
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordsweb-access-request-logos',
  'recordsweb-access-request-logos',
  false,
  4194304,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recordsweb_access_request_logo_insert" on storage.objects;
create policy "recordsweb_access_request_logo_insert"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'recordsweb-access-request-logos'
  and (storage.foldername(name))[1] = 'requests'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and lower(storage.extension(name)) in ('png','jpg','jpeg','webp')
);

-- No public SELECT/UPDATE/DELETE policy is created. Requests and logos are private
-- and are reviewed from the Supabase dashboard/service-role environment.

commit;
