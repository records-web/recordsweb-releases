-- ==========================================================================
-- RecordsWeb 3.8.0 — Platform Discord Operations
-- ==========================================================================
-- Adds platform-level Discord broadcasts, delivery logging and community
-- announcement preferences on top of the existing RecordsWeb Bot integration.
-- Requires recordsweb-3.4.0-discord-integration.sql.
-- ==========================================================================

begin;

alter table public.recordsweb_discord_integrations
  add column if not exists platform_announcements_enabled boolean not null default true,
  add column if not exists critical_notifications_enabled boolean not null default true,
  add column if not exists last_health_check_at timestamptz;

create table if not exists public.recordsweb_discord_broadcasts (
  id uuid primary key default gen_random_uuid(),
  broadcast_type text not null default 'announcement',
  severity text not null default 'info',
  title text not null,
  message text not null,
  target_scope text not null default 'all',
  target_modes text[] not null default '{}',
  target_organisation_ids uuid[] not null default '{}',
  affected_services text[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'sending',
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint recordsweb_discord_broadcast_type_check check (broadcast_type in (
    'announcement','incident','critical',
    'maintenance_planned','maintenance_started','maintenance_update','maintenance_complete'
  )),
  constraint recordsweb_discord_broadcast_severity_check check (severity in ('info','warning','critical','success')),
  constraint recordsweb_discord_broadcast_scope_check check (target_scope in ('all','modes','selected')),
  constraint recordsweb_discord_broadcast_status_check check (status in ('sending','sent','partial','failed'))
);

create table if not exists public.recordsweb_discord_deliveries (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid references public.recordsweb_discord_broadcasts(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  guild_id text,
  guild_name text not null default '',
  channel_id text,
  channel_name text not null default '',
  status text not null default 'pending',
  discord_message_id text,
  error text,
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint recordsweb_discord_delivery_status_check check (status in ('pending','sent','failed','skipped'))
);

create index if not exists recordsweb_discord_broadcasts_created_idx
  on public.recordsweb_discord_broadcasts(created_at desc);

create index if not exists recordsweb_discord_deliveries_broadcast_idx
  on public.recordsweb_discord_deliveries(broadcast_id, attempted_at desc);

create index if not exists recordsweb_discord_deliveries_organisation_idx
  on public.recordsweb_discord_deliveries(organisation_id, attempted_at desc);

create index if not exists recordsweb_discord_deliveries_status_idx
  on public.recordsweb_discord_deliveries(status, attempted_at desc);

comment on table public.recordsweb_discord_broadcasts is
  'Platform Management Discord broadcasts sent through the official RecordsWeb Bot.';

comment on table public.recordsweb_discord_deliveries is
  'Per-community delivery attempts for RecordsWeb platform Discord broadcasts.';

alter table public.recordsweb_discord_broadcasts enable row level security;
alter table public.recordsweb_discord_deliveries enable row level security;

revoke all on table public.recordsweb_discord_broadcasts from anon, authenticated;
revoke all on table public.recordsweb_discord_deliveries from anon, authenticated;
grant all on table public.recordsweb_discord_broadcasts to service_role;
grant all on table public.recordsweb_discord_deliveries to service_role;

commit;
