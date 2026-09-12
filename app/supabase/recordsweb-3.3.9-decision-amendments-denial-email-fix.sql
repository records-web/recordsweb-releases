-- RecordsWeb 3.3.9 — decision amendment + denial email reliability patch
-- Website-only patch. Run once in Supabase SQL Editor.
--
-- Enables:
--   * Approved -> Denied -> Approved status changes
--   * An amended decision email every time the saved decision changes
--   * Retry of a decision email that failed to send
--   * Existing approved/denied rows are backfilled from the legacy email markers

begin;

alter table public.recordsweb_access_requests
  add column if not exists decision_revision integer not null default 0,
  add column if not exists decision_email_revision integer not null default 0,
  add column if not exists last_decision_email_status text,
  add column if not exists last_decision_email_sent_at timestamptz;

do $$ begin
  alter table public.recordsweb_access_requests
    add constraint recordsweb_access_requests_decision_revision_nonnegative
    check (decision_revision >= 0 and decision_email_revision >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.recordsweb_access_requests
    add constraint recordsweb_access_requests_last_decision_email_status_allowed
    check (last_decision_email_status is null or last_decision_email_status in ('approved','declined'));
exception when duplicate_object then null; end $$;

-- Give already-decided requests a revision of 1. Mark that revision as emailed
-- only where the corresponding historical timestamp proves a successful send.
update public.recordsweb_access_requests
set
  decision_revision = case
    when status in ('approved','declined') then greatest(decision_revision, 1)
    else decision_revision
  end,
  decision_email_revision = case
    when status = 'approved' and approved_email_sent_at is not null then greatest(decision_email_revision, 1)
    when status = 'declined' and declined_email_sent_at is not null then greatest(decision_email_revision, 1)
    else decision_email_revision
  end,
  last_decision_email_status = case
    when approved_email_sent_at is null and declined_email_sent_at is null then last_decision_email_status
    when coalesce(approved_email_sent_at, '-infinity'::timestamptz) >= coalesce(declined_email_sent_at, '-infinity'::timestamptz) then 'approved'
    else 'declined'
  end,
  last_decision_email_sent_at = greatest(approved_email_sent_at, declined_email_sent_at)
where status in ('approved','declined')
   or approved_email_sent_at is not null
   or declined_email_sent_at is not null;

-- PostgreSQL's greatest() returns null when all values are null; preserve any
-- pre-existing last sent timestamp if this patch is rerun.
update public.recordsweb_access_requests
set last_decision_email_sent_at = coalesce(
  last_decision_email_sent_at,
  approved_email_sent_at,
  declined_email_sent_at
)
where last_decision_email_sent_at is null;

-- Replace the review RPC so every *change into a decision state* creates a new
-- decision revision. Re-saving the same status does not create a new revision,
-- which allows the API to distinguish retry from amendment.
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

  update public.recordsweb_access_requests r
  set
    status = v_status,
    operator_notes = nullif(trim(coalesce(p_operator_notes, '')), ''),
    provider_comments = nullif(trim(coalesce(p_provider_comments, '')), ''),
    reviewed_at = case when v_status = 'pending' then null else now() end,
    reviewed_by = case when v_status = 'pending' then null else auth.uid() end,
    decision_revision = case
      when v_status in ('approved','declined')
       and r.status is distinct from v_status
        then r.decision_revision + 1
      else r.decision_revision
    end,
    updated_at = now()
  where r.id = p_request_id
  returning r.id into v_id;

  if v_id is null then
    raise exception 'Access request not found.';
  end if;

  return v_id;
end;
$$;

revoke all on function public.recordsweb_review_access_request(uuid,text,text,text) from public;
grant execute on function public.recordsweb_review_access_request(uuid,text,text,text) to authenticated;

commit;

-- Optional verification:
-- select id, community_name, status, decision_revision, decision_email_revision,
--        last_decision_email_status, last_decision_email_sent_at,
--        approved_email_sent_at, declined_email_sent_at
-- from public.recordsweb_access_requests
-- order by created_at desc;
