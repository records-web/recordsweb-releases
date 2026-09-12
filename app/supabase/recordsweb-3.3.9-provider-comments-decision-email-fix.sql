-- RecordsWeb 3.3.9 — provider comments + decision email review support
-- Website-only patch. Safe to run on an existing v3.3.9 database.

begin;

alter table public.recordsweb_access_requests
  add column if not exists provider_comments text,
  add column if not exists approved_email_sent_at timestamptz,
  add column if not exists declined_email_sent_at timestamptz;

comment on column public.recordsweb_access_requests.provider_comments is
  'Public-facing comments from the RecordsWeb provider/reviewer. Included in approval or decline emails when present.';

comment on column public.recordsweb_access_requests.approved_email_sent_at is
  'When the automatic deployment-request approval email was successfully sent.';

comment on column public.recordsweb_access_requests.declined_email_sent_at is
  'When the automatic deployment-request decline email was successfully sent.';

-- The row shape changed, so PostgreSQL requires the existing table-returning
-- function to be dropped before it can be recreated with provider_comments.
drop function if exists public.recordsweb_list_access_requests(text);

create function public.recordsweb_list_access_requests(p_status text default null)
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
  provider_comments text,
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
    r.provider_comments,
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

-- Replace the old 3-argument review RPC with a backwards-compatible 4-argument
-- version. p_provider_comments defaults to null, so older callers remain valid.
drop function if exists public.recordsweb_review_access_request(uuid,text,text);
drop function if exists public.recordsweb_review_access_request(uuid,text,text,text);

create function public.recordsweb_review_access_request(
  p_request_id uuid,
  p_status text,
  p_operator_notes text default null,
  p_provider_comments text default null
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
    provider_comments = nullif(trim(coalesce(p_provider_comments, '')), ''),
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

revoke all on function public.recordsweb_review_access_request(uuid,text,text,text) from public;
grant execute on function public.recordsweb_review_access_request(uuid,text,text,text) to authenticated;

commit;
