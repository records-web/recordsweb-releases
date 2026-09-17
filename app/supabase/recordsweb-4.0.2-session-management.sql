-- RecordsWeb 4.0.2 — Platform session management
-- Apply after recordsweb-4.0.0-security-hardening.sql.
-- Adds an explicit runtime type so Platform Management can distinguish website
-- sessions from Electron desktop sessions without exposing authentication tokens.

begin;

alter table public.recordsweb_security_sessions
  add column if not exists client_type text;

-- Backfill sessions created by 4.0.0 / 4.0.1. Electron's Chromium user agent
-- includes "Electron/"; all other existing renderer sessions are web sessions.
update public.recordsweb_security_sessions
set client_type = case
  when lower(coalesce(user_agent, '')) like '%electron/%' then 'electron'
  else 'website'
end
where client_type is null;

alter table public.recordsweb_security_sessions
  alter column client_type set default 'website';

alter table public.recordsweb_security_sessions
  alter column client_type set not null;

alter table public.recordsweb_security_sessions
  drop constraint if exists recordsweb_security_sessions_client_type_check;

alter table public.recordsweb_security_sessions
  add constraint recordsweb_security_sessions_client_type_check
  check (client_type in ('website','electron'));

create index if not exists recordsweb_security_sessions_client_seen_idx
  on public.recordsweb_security_sessions (client_type, last_seen_at desc);

commit;
