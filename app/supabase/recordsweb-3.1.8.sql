-- RecordsWeb 3.1.8 - appointment reception waiting timer.
-- Run after the existing RecordsWeb schema. Safe to re-run.

alter table public.appointments
  add column if not exists wait_started_at timestamptz;

-- Existing appointments already marked as arrived get a sensible starting point.
-- Their last appointment update is used because an exact historical check-in time
-- was not stored before 3.1.8.
update public.appointments
set wait_started_at = coalesce(wait_started_at, updated_at, now())
where status = 'Arrived'
  and wait_started_at is null;

-- Appointments not currently waiting should not retain an active timer.
update public.appointments
set wait_started_at = null
where status <> 'Arrived'
  and wait_started_at is not null;
