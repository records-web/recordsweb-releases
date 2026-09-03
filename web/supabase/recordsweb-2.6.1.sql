-- RecordsWeb 2.6.1 - private fit-note PDF archive.
-- Re-runnable. Run in the Supabase SQL Editor before expecting automatic PDF archival.

create table if not exists public.fit_note_pdfs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  file_size bigint,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fit_note_pdfs_patient_created_idx
  on public.fit_note_pdfs (patient_id, created_at desc);

alter table public.fit_note_pdfs enable row level security;
grant select, insert, update, delete on public.fit_note_pdfs to authenticated;

drop policy if exists "fit_note_pdfs_read" on public.fit_note_pdfs;
drop policy if exists "fit_note_pdfs_insert" on public.fit_note_pdfs;
drop policy if exists "fit_note_pdfs_update" on public.fit_note_pdfs;
drop policy if exists "fit_note_pdfs_delete" on public.fit_note_pdfs;

create policy "fit_note_pdfs_read" on public.fit_note_pdfs for select to authenticated
using (
  exists (
    select 1 from public.patients p
    where p.id = patient_id
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "fit_note_pdfs_insert" on public.fit_note_pdfs for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.patients p
    where p.id = patient_id
      and p.organisation_id = public.current_organisation_id()
  )
  and exists (
    select 1 from public.documents d
    where d.id = document_id
      and d.patient_id = patient_id
  )
);

create policy "fit_note_pdfs_update" on public.fit_note_pdfs for update to authenticated
using (
  exists (
    select 1 from public.patients p
    where p.id = patient_id
      and p.organisation_id = public.current_organisation_id()
  )
)
with check (
  exists (
    select 1 from public.patients p
    where p.id = patient_id
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "fit_note_pdfs_delete" on public.fit_note_pdfs for delete to authenticated
using (
  exists (
    select 1 from public.patients p
    where p.id = patient_id
      and p.organisation_id = public.current_organisation_id()
  )
);

-- Clinical PDFs are private. Access is controlled by Storage RLS and the signed-in
-- user's active Grove Way organisation membership.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordsweb-documents',
  'recordsweb-documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recordsweb_documents_read" on storage.objects;
drop policy if exists "recordsweb_documents_insert" on storage.objects;
drop policy if exists "recordsweb_documents_update" on storage.objects;
drop policy if exists "recordsweb_documents_delete" on storage.objects;

create policy "recordsweb_documents_read" on storage.objects for select to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and (storage.foldername(name))[1] = 'grove-way-health-centre'
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-documents'
  and (storage.foldername(name))[1] = 'grove-way-health-centre'
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_update" on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and (storage.foldername(name))[1] = 'grove-way-health-centre'
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
)
with check (
  bucket_id = 'recordsweb-documents'
  and (storage.foldername(name))[1] = 'grove-way-health-centre'
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and (storage.foldername(name))[1] = 'grove-way-health-centre'
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);
