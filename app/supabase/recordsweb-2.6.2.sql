-- RecordsWeb 2.6.2 - fit-note PDF archive + prescribing PIN security.
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


-- RecordsWeb 2.6.2 - per-user four digit prescribing PIN.
-- PINs are never stored in plaintext. Medication writes are routed through a
-- SECURITY DEFINER function that verifies the signed-in user's PIN.

create extension if not exists pgcrypto;

create table if not exists public.prescribing_pins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prescribing_pins enable row level security;
revoke all on public.prescribing_pins from anon, authenticated;

create or replace function public.recordsweb_has_prescribing_pin()
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.prescribing_pins pp
    join public.profiles p on p.id = pp.user_id
    where pp.user_id = auth.uid() and p.active = true
  );
$$;

create or replace function public.recordsweb_set_prescribing_pin(p_new_pin text, p_current_pin text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing public.prescribing_pins%rowtype;
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then raise exception 'Prescribing PIN must contain exactly 4 digits.'; end if;

  select * into v_profile from public.profiles where id = auth.uid() and active = true;
  if not found then raise exception 'Your RecordsWeb profile is not active.'; end if;

  select * into v_existing from public.prescribing_pins where user_id = auth.uid();
  if found then
    if p_current_pin is null or p_current_pin !~ '^[0-9]{4}$' then raise exception 'Enter your current 4-digit prescribing PIN.'; end if;
    if v_existing.pin_hash <> crypt(p_current_pin, v_existing.pin_hash) then raise exception 'Current prescribing PIN is incorrect.'; end if;
    update public.prescribing_pins
      set pin_hash = crypt(p_new_pin, gen_salt('bf', 10)), updated_at = now()
      where user_id = auth.uid();
  else
    insert into public.prescribing_pins (user_id, pin_hash)
    values (auth.uid(), crypt(p_new_pin, gen_salt('bf', 10)));
  end if;
  return true;
end;
$$;

create or replace function public.recordsweb_save_medication(
  p_patient_id uuid,
  p_medication_id uuid,
  p_payload jsonb,
  p_pin text
)
returns public.medications
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
  v_pin public.prescribing_pins%rowtype;
  v_med public.medications%rowtype;
  v_authoriser text;
  v_type text;
  v_name text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'Enter your 4-digit prescribing PIN.'; end if;

  select * into v_profile from public.profiles where id = auth.uid() and active = true;
  if not found then raise exception 'Your RecordsWeb profile is not active.'; end if;

  select * into v_pin from public.prescribing_pins where user_id = auth.uid();
  if not found then raise exception 'Create a prescribing PIN before authorising medication.'; end if;
  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then raise exception 'Prescribing PIN is incorrect.'; end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organisation_id = v_profile.organisation_id
  ) then raise exception 'Patient is not available to your organisation.'; end if;

  v_name := trim(coalesce(p_payload->>'name',''));
  if v_name = '' then raise exception 'Medication name is required.'; end if;
  v_type := coalesce(nullif(p_payload->>'type',''), 'Acute Meds');
  if v_type not in ('Acute Meds','Repeat','Long Term Meds') then raise exception 'Medication group is invalid.'; end if;
  v_authoriser := coalesce(nullif(trim(concat_ws(' ', v_profile.title, v_profile.first_name, v_profile.last_name)), ''), v_profile.display_name, v_profile.username);

  if p_medication_id is null then
    insert into public.medications (
      patient_id, name, dose, quantity, type, last_issue_date,
      authoriser, issues, method, usage, active
    ) values (
      p_patient_id,
      v_name,
      nullif(p_payload->>'dose',''),
      nullif(p_payload->>'quantity',''),
      v_type,
      nullif(p_payload->>'last_issue_date','')::date,
      v_authoriser,
      nullif(p_payload->>'issues',''),
      nullif(p_payload->>'method',''),
      nullif(p_payload->>'usage',''),
      coalesce((p_payload->>'active')::boolean, true)
    ) returning * into v_med;
  else
    update public.medications m set
      name = v_name,
      dose = nullif(p_payload->>'dose',''),
      quantity = nullif(p_payload->>'quantity',''),
      type = v_type,
      last_issue_date = nullif(p_payload->>'last_issue_date','')::date,
      authoriser = v_authoriser,
      issues = nullif(p_payload->>'issues',''),
      method = nullif(p_payload->>'method',''),
      usage = nullif(p_payload->>'usage',''),
      active = coalesce((p_payload->>'active')::boolean, m.active),
      updated_at = now()
    where m.id = p_medication_id and m.patient_id = p_patient_id
    returning * into v_med;
    if not found then raise exception 'Medication record was not found.'; end if;
  end if;

  return v_med;
end;
$$;

revoke all on function public.recordsweb_has_prescribing_pin() from public, anon;
revoke all on function public.recordsweb_set_prescribing_pin(text, text) from public, anon;
revoke all on function public.recordsweb_save_medication(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.recordsweb_has_prescribing_pin() to authenticated;
grant execute on function public.recordsweb_set_prescribing_pin(text, text) to authenticated;
grant execute on function public.recordsweb_save_medication(uuid, uuid, jsonb, text) to authenticated;

-- Prevent authenticated clients from bypassing the PIN by writing medication rows
-- directly. Reads remain available through existing organisation RLS.
revoke insert, update on public.medications from authenticated, anon;
