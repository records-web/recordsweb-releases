-- RecordsWeb 3.2.1 — restricted /review-request operator page
-- Run AFTER recordsweb-3.2.1-public-access-requests.sql.
-- Access is limited to authorised RecordsWeb reviewer identities in the forms
-- gus.farnsworth@XX.XX or alfie-james@XX.XX. The XX.XX suffix must match the
-- authenticated user's active RecordsWeb organisation profile.

begin;

create or replace function public.recordsweb_is_access_request_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with reviewer_identity as (
    select
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) as email,
      lower(coalesce(public.current_organisation_code(), '')) as organisation_code
  )
  select coalesce((
    select
      email ~ '^(gus\.farnsworth|alfie-james)@[a-z]{2}\.[a-z]{2}$'
      and split_part(email, '@', 2) = organisation_code
    from reviewer_identity
  ), false);
$$;

revoke all on function public.recordsweb_is_access_request_reviewer() from public;
grant execute on function public.recordsweb_is_access_request_reviewer() to authenticated;

create or replace function public.recordsweb_list_access_requests(p_status text default null)
returns table (
  id uuid,
  community_name text,
  requested_mode text,
  discord_url text,
  roblox_group_url text,
  member_range text,
  contact_name text,
  contact_email text,
  discord_username text,
  logo_path text,
  additional_details text,
  authorised_contact boolean,
  status text,
  operator_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
begin
  if not public.recordsweb_is_access_request_reviewer() then
    raise exception 'Access denied: this account is not authorised to review RecordsWeb access requests.' using errcode = '42501';
  end if;

  if v_status is not null and v_status not in ('pending','reviewing','approved','declined') then
    raise exception 'Invalid request status.';
  end if;

  return query
  select
    r.id,
    r.community_name,
    r.requested_mode,
    r.discord_url,
    r.roblox_group_url,
    r.member_range,
    r.contact_name,
    r.contact_email,
    r.discord_username,
    r.logo_path,
    r.additional_details,
    r.authorised_contact,
    r.status,
    r.operator_notes,
    r.reviewed_at,
    r.reviewed_by,
    r.created_at,
    r.updated_at
  from public.recordsweb_access_requests r
  where v_status is null or r.status = v_status
  order by
    case r.status when 'pending' then 0 when 'reviewing' then 1 when 'approved' then 2 else 3 end,
    r.created_at desc;
end;
$$;

revoke all on function public.recordsweb_list_access_requests(text) from public;
grant execute on function public.recordsweb_list_access_requests(text) to authenticated;

create or replace function public.recordsweb_review_access_request(
  p_request_id uuid,
  p_status text,
  p_operator_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_id uuid;
begin
  if not public.recordsweb_is_access_request_reviewer() then
    raise exception 'Access denied: this account is not authorised to review RecordsWeb access requests.' using errcode = '42501';
  end if;

  if v_status not in ('pending','reviewing','approved','declined') then
    raise exception 'Invalid request status.';
  end if;

  update public.recordsweb_access_requests
  set
    status = v_status,
    operator_notes = nullif(trim(coalesce(p_operator_notes, '')), ''),
    reviewed_at = case when v_status = 'pending' then null else now() end,
    reviewed_by = case when v_status = 'pending' then null else auth.uid() end,
    updated_at = now()
  where id = p_request_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Access request not found.';
  end if;

  return v_id;
end;
$$;

revoke all on function public.recordsweb_review_access_request(uuid,text,text) from public;
grant execute on function public.recordsweb_review_access_request(uuid,text,text) to authenticated;

-- The request-logo bucket remains private. Only the authorised reviewer can
-- read objects, which allows the web client to create short-lived signed URLs.
drop policy if exists "recordsweb_access_request_logo_reviewer_select" on storage.objects;
create policy "recordsweb_access_request_logo_reviewer_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'recordsweb-access-request-logos'
  and public.recordsweb_is_access_request_reviewer()
);

commit;
