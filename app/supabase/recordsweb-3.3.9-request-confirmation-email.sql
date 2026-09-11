-- RecordsWeb 3.3.9 — deployment request confirmation email tracking
-- Run after the public access-request migration.

begin;

alter table public.recordsweb_access_requests
  add column if not exists confirmation_email_sent_at timestamptz;

commit;
