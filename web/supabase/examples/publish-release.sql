-- Desktop release example. For a shared desktop + web release, run only AFTER
-- the matching GitHub Release AND website deployment are ready.
-- The matching GitHub Release contains:
--   latest.yml
--   RecordsWeb-Setup-3.2.0.exe
--   RecordsWeb-Setup-3.2.0.exe.blockmap
--   latest-mac.yml
--   RecordsWeb-3.2.0-macOS-universal.dmg
--   RecordsWeb-3.2.0-macOS-universal.zip
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
  '3.2.0',
  'stable',
  'RecordsWeb 3.2.0',
  true,
  now()
)
on conflict (channel, version) do update set
  release_notes = excluded.release_notes,
  active = excluded.active,
  published_at = excluded.published_at;
