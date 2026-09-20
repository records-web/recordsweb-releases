-- RecordsWeb 4.1.1 — Discord command support
-- Apply after recordsweb-4.1.0-discord-worker.sql.

begin;

alter table public.recordsweb_discord_integrations
  add column if not exists log_channel_id text,
  add column if not exists log_channel_name text not null default '';

do $$ begin
  alter table public.recordsweb_discord_integrations
    add constraint recordsweb_discord_integrations_log_channel_format
    check (log_channel_id is null or log_channel_id ~ '^[0-9]{17,20}$');
exception when duplicate_object then null; end $$;

create index if not exists recordsweb_discord_integrations_log_channel_idx
  on public.recordsweb_discord_integrations(log_channel_id)
  where log_channel_id is not null;

commit;
