-- RecordsWeb 5.1.0 — LiveKit Cloud bodycams for RecordsWeb Policing
-- Live video is not stored by this migration. Supabase stores session/audit metadata only.

begin;

create table if not exists public.police_bodycam_sessions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  officer_id uuid not null references public.profiles(id) on delete cascade,
  incident_id uuid references public.police_incidents(id) on delete set null,
  room_name text not null unique,
  status text not null default 'live' check (status in ('live','ended','failed')),
  callsign text,
  camera_label text,
  location_label text,
  microphone_enabled boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists police_bodycam_one_live_per_officer_uidx
  on public.police_bodycam_sessions(officer_id)
  where status = 'live';

create index if not exists police_bodycam_org_live_idx
  on public.police_bodycam_sessions(organisation_id, status, started_at desc);

create index if not exists police_bodycam_incident_idx
  on public.police_bodycam_sessions(organisation_id, incident_id, started_at desc);

create table if not exists public.police_bodycam_view_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.police_bodycam_sessions(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create index if not exists police_bodycam_view_session_idx
  on public.police_bodycam_view_events(session_id, joined_at desc);

create index if not exists police_bodycam_view_org_idx
  on public.police_bodycam_view_events(organisation_id, joined_at desc);

alter table public.police_bodycam_sessions enable row level security;
alter table public.police_bodycam_view_events enable row level security;

-- Staff can see bodycam metadata only for their own RecordsWeb organisation and only
-- when that organisation is entitled to RecordsWeb Policing. Creation/update is
-- performed by the authenticated recordsweb-bodycam Edge Function using the service role.
drop policy if exists police_bodycam_sessions_select on public.police_bodycam_sessions;
create policy police_bodycam_sessions_select
  on public.police_bodycam_sessions
  for select
  to authenticated
  using (
    organisation_id = public.current_organisation_id()
    and public.recordsweb_current_has_product('policing')
  );

drop policy if exists police_bodycam_view_events_select on public.police_bodycam_view_events;
create policy police_bodycam_view_events_select
  on public.police_bodycam_view_events
  for select
  to authenticated
  using (
    organisation_id = public.current_organisation_id()
    and public.recordsweb_current_has_product('policing')
    and (
      viewer_id = auth.uid()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organisation_id = police_bodycam_view_events.organisation_id
          and p.active = true
          and p.is_management = true
      )
    )
  );

grant select on public.police_bodycam_sessions to authenticated;
grant select on public.police_bodycam_view_events to authenticated;

comment on table public.police_bodycam_sessions is 'RecordsWeb Policing live bodycam metadata. Live media is carried by LiveKit Cloud and is not stored in this table.';
comment on column public.police_bodycam_sessions.room_name is 'Opaque LiveKit room identifier; not a credential.';
comment on table public.police_bodycam_view_events is 'Audit-oriented viewer join/leave metadata for RecordsWeb Policing bodycam sessions.';

commit;
