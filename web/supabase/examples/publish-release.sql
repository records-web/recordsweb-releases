-- Desktop release example. For a shared desktop + web release, run only AFTER
-- the matching GitHub Release AND website deployment are ready.
-- The matching GitHub Release contains:
--   latest.yml
--   RecordsWeb-Setup-2.5.0.exe
--   RecordsWeb-Setup-2.5.0.exe.blockmap
--
-- GitHub owner/repository are configured in the RecordsWeb .env before building.
-- Supabase remains the mandatory-version gate; GitHub hosts the binary files.

insert into public.app_releases (
  version,
  channel,
  release_notes,
  active,
  published_at
)
values (
  '2.5.0',
  'stable',
  'RecordsWeb 2.5.0',
  true,
  now()
)
on conflict (channel, version) do update set
  release_notes = excluded.release_notes,
  active = excluded.active,
  published_at = excluded.published_at;
