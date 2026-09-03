-- RecordsWeb 2.5.9 - structured documents and fit notes.
-- Safe to run more than once.

alter table public.documents add column if not exists document_type text not null default 'General';
alter table public.documents add column if not exists status text not null default 'Filed';
alter table public.documents add column if not exists details jsonb not null default '{}'::jsonb;

update public.documents
set document_type = case when category = 'Fit Note' then 'Fit Note' else coalesce(nullif(document_type, ''), 'General') end,
    status = coalesce(nullif(status, ''), 'Filed'),
    details = coalesce(details, '{}'::jsonb);
