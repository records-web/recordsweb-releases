-- RecordsWeb 3.3.5 — problem start/end dates and active/past history views.
-- Safe to run more than once.

begin;

alter table public.problems
  add column if not exists end_date date;

comment on column public.problems.end_date is
  'Date the clinical problem ended/resolved. Null while the problem remains active.';

commit;
