-- ============================================================================
-- RecordsWeb 3.4.0 — Discord Bot Integration
-- ============================================================================
-- Adds one platform-owned RecordsWeb Bot that can be connected to individual
-- community Discord servers. Community Management can allocate a maintenance
-- channel and link staff Discord user IDs for explicit login-detail DMs.
--
-- SECURITY:
--   * Discord bot tokens are NEVER stored in PostgreSQL or the client app.
--   * The recordsweb-discord Edge Function uses RECORDSWEB_DISCORD_BOT_TOKEN.
--   * Temporary passwords are never persisted by this migration/integration.
-- ============================================================================

begin;

alter table public.profiles
  add column if not exists discord_user_id text;

comment on column public.profiles.discord_user_id is
  'Optional Discord user snowflake used by RecordsWeb Bot for explicit Management-initiated account-detail DMs.';

do $$
begin
  alter table public.profiles
    add constraint profiles_discord_user_id_format
    check (discord_user_id is null or discord_user_id ~ '^[0-9]{17,20}$');
exception when duplicate_object then null;
end $$;

create index if not exists profiles_discord_user_id_idx
  on public.profiles(discord_user_id)
  where discord_user_id is not null;

create table if not exists public.recordsweb_discord_integrations (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  guild_id text not null,
  guild_name text not null default '',
  channel_id text not null,
  channel_name text not null default '',
  maintenance_notifications boolean not null default true,
  login_dm_enabled boolean not null default true,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_by_name text not null default '',
  verified_at timestamptz,
  last_notification_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recordsweb_discord_integrations_guild_format check (guild_id ~ '^[0-9]{17,20}$'),
  constraint recordsweb_discord_integrations_channel_format check (channel_id ~ '^[0-9]{17,20}$')
);

create unique index if not exists recordsweb_discord_integrations_channel_unique_idx
  on public.recordsweb_discord_integrations(guild_id, channel_id);

comment on table public.recordsweb_discord_integrations is
  'Per-community configuration for the single platform-owned RecordsWeb Discord bot. Bot credentials remain server-side in Edge Function secrets.';

alter table public.recordsweb_discord_integrations enable row level security;

-- The Discord integration is deliberately Edge-Function-only. Community clients
-- call recordsweb-discord, which validates the signed-in Management account and
-- uses the service role. No bot configuration rows are directly exposed to anon
-- or authenticated browser/desktop queries.
revoke all on table public.recordsweb_discord_integrations from anon;
revoke all on table public.recordsweb_discord_integrations from authenticated;
grant all on table public.recordsweb_discord_integrations to service_role;

commit;
