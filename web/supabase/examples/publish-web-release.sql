-- RecordsWeb shared desktop + website release gate.
--
-- IMPORTANT: run this only after BOTH are ready:
--   1. The matching desktop GitHub Release has been published (when applicable).
--   2. The matching RecordsWeb website version has finished deploying.
--
-- The web build checks the same `stable` channel by default. Once this row is
-- published, an older website shows "RecordsWeb needs an update" and refreshes
-- into the deployed version. Desktop RecordsWeb can continue using the same row
-- for its normal installer update.

insert into public.app_releases (
  version,
  channel,
  release_notes,
  active,
  published_at
)
values (
  '3.1.9',
  'stable',
  'RecordsWeb 3.1.9',
  true,
  now()
)
on conflict (channel, version) do update set
  release_notes = excluded.release_notes,
  active = excluded.active,
  published_at = excluded.published_at;

-- If you ever want website-only releases, configure the website with:
-- VITE_RECORDSWEB_RELEASE_CHANNEL=web
-- and publish those releases with channel = 'web' instead. That prevents a
-- website-only release from triggering the desktop updater.
