-- RecordsWeb 3.8.2 - Patient Discord IDs and automatic clinical DMs

alter table public.patients
  add column if not exists discord_user_id text;

comment on column public.patients.discord_user_id is
  'Discord User ID used by RecordsWeb Bot for patient prescription and fit-note direct messages.';

do $$ begin
  alter table public.patients
    add constraint patients_discord_user_id_format
    check (discord_user_id is null or discord_user_id ~ '^[0-9]{17,20}$');
exception when duplicate_object then null; end $$;

create unique index if not exists patients_org_discord_user_unique_idx
  on public.patients(organisation_id, discord_user_id)
  where discord_user_id is not null;
