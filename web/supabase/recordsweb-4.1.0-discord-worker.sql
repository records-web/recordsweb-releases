-- ==========================================================================
-- RecordsWeb 4.1.0 — 24/7 Discord Bot Worker + Web-managed Commands
-- ==========================================================================
-- Moves Discord delivery away from the website/serverless runtime. RecordsWeb
-- queues work in Supabase; the always-on Discord bot claims jobs through the
-- recordsweb-bot-api Edge Function.
-- ==========================================================================

begin;

-- The bot reports its own health instead of RecordsWeb probing Discord with a
-- bot token from an Edge Function.
create table if not exists public.recordsweb_discord_bot_state (
  id text primary key default 'primary',
  bot_user_id text,
  client_id text,
  username text not null default 'RecordsWeb Bot',
  discriminator text not null default '0',
  avatar text,
  host_name text not null default '',
  version text not null default '',
  status text not null default 'offline',
  guild_count integer not null default 0,
  websocket_ping_ms integer,
  process_uptime_seconds bigint not null default 0,
  started_at timestamptz,
  last_heartbeat_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint recordsweb_discord_bot_state_status_check check (status in ('starting','online','degraded','offline'))
);

insert into public.recordsweb_discord_bot_state (id, status)
values ('primary', 'offline')
on conflict (id) do nothing;

create table if not exists public.recordsweb_discord_guild_cache (
  guild_id text primary key,
  guild_name text not null default 'Discord server',
  icon text,
  member_count integer,
  owner_id text,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recordsweb_discord_guild_cache_id_check check (guild_id ~ '^[0-9]{17,20}$')
);

create table if not exists public.recordsweb_discord_channel_cache (
  channel_id text primary key,
  guild_id text not null references public.recordsweb_discord_guild_cache(guild_id) on delete cascade,
  channel_name text not null default 'channel',
  channel_type integer not null default 0,
  position integer not null default 0,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recordsweb_discord_channel_cache_channel_check check (channel_id ~ '^[0-9]{17,20}$'),
  constraint recordsweb_discord_channel_cache_guild_check check (guild_id ~ '^[0-9]{17,20}$')
);

create index if not exists recordsweb_discord_channel_cache_guild_idx
  on public.recordsweb_discord_channel_cache(guild_id, position, channel_name);

-- Generic queue: all outbound channel messages and DMs are handled by the bot.
create table if not exists public.recordsweb_discord_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  delivery_id uuid references public.recordsweb_discord_deliveries(id) on delete set null,
  job_type text not null,
  target_guild_id text,
  target_channel_id text,
  target_user_id text,
  payload jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  completed_at timestamptz,
  last_error text,
  result jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recordsweb_discord_jobs_type_check check (job_type in ('channel_message','dm_message')),
  constraint recordsweb_discord_jobs_status_check check (status in ('pending','processing','sent','failed','cancelled')),
  constraint recordsweb_discord_jobs_target_check check (
    (job_type = 'channel_message' and target_channel_id is not null)
    or (job_type = 'dm_message' and target_user_id is not null)
  )
);

create index if not exists recordsweb_discord_jobs_claim_idx
  on public.recordsweb_discord_jobs(status, available_at, priority, created_at);
create index if not exists recordsweb_discord_jobs_org_idx
  on public.recordsweb_discord_jobs(organisation_id, created_at desc);
create index if not exists recordsweb_discord_jobs_delivery_idx
  on public.recordsweb_discord_jobs(delivery_id) where delivery_id is not null;

-- Website-managed custom slash commands. The bot merges these with commands
-- supplied as source files in its src/commands folder.
create table if not exists public.recordsweb_discord_commands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null,
  response text not null,
  response_mode text not null default 'text',
  ephemeral boolean not null default false,
  enabled boolean not null default true,
  show_in_help boolean not null default true,
  accent_color integer not null default 1011645,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recordsweb_discord_commands_name_check check (name ~ '^[a-z0-9_-]{1,32}$'),
  constraint recordsweb_discord_commands_description_check check (char_length(description) between 1 and 100),
  constraint recordsweb_discord_commands_response_check check (char_length(response) between 1 and 1900),
  constraint recordsweb_discord_commands_mode_check check (response_mode in ('text','embed')),
  constraint recordsweb_discord_commands_colour_check check (accent_color between 0 and 16777215)
);

create index if not exists recordsweb_discord_commands_enabled_idx
  on public.recordsweb_discord_commands(enabled, name);

-- 4.1 broadcasts are queued first and become sent/partial/failed after worker
-- completion. Keep backwards-compatible states from 3.8.0.
do $$
begin
  alter table public.recordsweb_discord_broadcasts
    drop constraint if exists recordsweb_discord_broadcast_status_check;
  alter table public.recordsweb_discord_broadcasts
    add constraint recordsweb_discord_broadcast_status_check
    check (status in ('queued','sending','sent','partial','failed'));
exception when undefined_table then null;
end $$;

-- Atomic queue claim. SKIP LOCKED makes a second bot process safe if a standby
-- worker is ever introduced.
create or replace function public.recordsweb_claim_discord_jobs(p_limit integer default 10, p_worker text default 'recordsweb-bot')
returns setof public.recordsweb_discord_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id
    from public.recordsweb_discord_jobs
    where status = 'pending'
      and available_at <= now()
    order by priority asc, created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  ), claimed as (
    update public.recordsweb_discord_jobs j
    set status = 'processing',
        claimed_at = now(),
        claimed_by = left(coalesce(p_worker, 'recordsweb-bot'), 120),
        attempts = attempts + 1,
        updated_at = now()
    from picked
    where j.id = picked.id
    returning j.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.recordsweb_claim_discord_jobs(integer,text) from public, anon, authenticated;
grant execute on function public.recordsweb_claim_discord_jobs(integer,text) to service_role;

-- No queue/bot/command table is directly writable from browser clients. All
-- access goes through RecordsWeb Edge Functions which enforce staff/operator
-- permissions.
alter table public.recordsweb_discord_bot_state enable row level security;
alter table public.recordsweb_discord_guild_cache enable row level security;
alter table public.recordsweb_discord_channel_cache enable row level security;
alter table public.recordsweb_discord_jobs enable row level security;
alter table public.recordsweb_discord_commands enable row level security;

revoke all on table public.recordsweb_discord_bot_state from anon, authenticated;
revoke all on table public.recordsweb_discord_guild_cache from anon, authenticated;
revoke all on table public.recordsweb_discord_channel_cache from anon, authenticated;
revoke all on table public.recordsweb_discord_jobs from anon, authenticated;
revoke all on table public.recordsweb_discord_commands from anon, authenticated;

grant all on table public.recordsweb_discord_bot_state to service_role;
grant all on table public.recordsweb_discord_guild_cache to service_role;
grant all on table public.recordsweb_discord_channel_cache to service_role;
grant all on table public.recordsweb_discord_jobs to service_role;
grant all on table public.recordsweb_discord_commands to service_role;

comment on table public.recordsweb_discord_jobs is
  'Outbound Discord work queue consumed by the always-on RecordsWeb Discord Bot.';
comment on table public.recordsweb_discord_commands is
  'Custom slash commands managed from RecordsWeb Platform Management and synced by the 24/7 bot.';
comment on table public.recordsweb_discord_bot_state is
  'Heartbeat and health state reported by the external always-on RecordsWeb Discord Bot.';

commit;
