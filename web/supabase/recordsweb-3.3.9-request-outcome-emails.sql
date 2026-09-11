-- RecordsWeb 3.3.9 — approval / decline email tracking patch
-- Use this small patch if confirmation_email_sent_at already exists.
-- Safe to run more than once.

begin;

alter table public.recordsweb_access_requests
  add column if not exists approved_email_sent_at timestamptz,
  add column if not exists declined_email_sent_at timestamptz;

comment on column public.recordsweb_access_requests.approved_email_sent_at is
  'When the automatic deployment-request approval email was successfully sent.';

comment on column public.recordsweb_access_requests.declined_email_sent_at is
  'When the automatic deployment-request decline email was successfully sent.';

commit;
