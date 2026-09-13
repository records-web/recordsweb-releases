-- RecordsWeb 3.8.1 - licensed clinical actions
-- Restricts new medication prescriptions to doctor/ACP roles and fit-note
-- issuing to doctor/ACP/registered-nurse roles. Safe to re-run.

create or replace function public.recordsweb_current_user_can_prescribe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = any(array[
          'GP Partner',
          'General Practitioner',
          'GP Registrar (GPST2-3)',
          'GP Registrar (GPST1)',
          'Advanced Clinical Practitioner',
          'Medical Director',
          'Consultant',
          'Registrar (ST4-ST9)',
          'PHEM Consultant',
          'PHEM Doctor'
        ]::text[])
        or coalesce(p.roles, array[]::text[]) && array[
          'GP Partner',
          'General Practitioner',
          'GP Registrar (GPST2-3)',
          'GP Registrar (GPST1)',
          'Advanced Clinical Practitioner',
          'Medical Director',
          'Consultant',
          'Registrar (ST4-ST9)',
          'PHEM Consultant',
          'PHEM Doctor'
        ]::text[]
      )
  );
$$;

create or replace function public.recordsweb_current_user_can_issue_fit_note()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = any(array[
          'GP Partner',
          'General Practitioner',
          'GP Registrar (GPST2-3)',
          'GP Registrar (GPST1)',
          'Advanced Clinical Practitioner',
          'Medical Director',
          'Consultant',
          'Registrar (ST4-ST9)',
          'PHEM Consultant',
          'PHEM Doctor',
          'Lead Nurse',
          'General Practice Nurse',
          'Director of Nursing',
          'Charge Nurse',
          'Staff Nurse'
        ]::text[])
        or coalesce(p.roles, array[]::text[]) && array[
          'GP Partner',
          'General Practitioner',
          'GP Registrar (GPST2-3)',
          'GP Registrar (GPST1)',
          'Advanced Clinical Practitioner',
          'Medical Director',
          'Consultant',
          'Registrar (ST4-ST9)',
          'PHEM Consultant',
          'PHEM Doctor',
          'Lead Nurse',
          'General Practice Nurse',
          'Director of Nursing',
          'Charge Nurse',
          'Staff Nurse'
        ]::text[]
      )
  );
$$;

revoke all on function public.recordsweb_current_user_can_prescribe() from public, anon;
revoke all on function public.recordsweb_current_user_can_issue_fit_note() from public, anon;
grant execute on function public.recordsweb_current_user_can_prescribe() to authenticated;
grant execute on function public.recordsweb_current_user_can_issue_fit_note() to authenticated;

create or replace function public.recordsweb_require_prescriber_for_new_medication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.recordsweb_current_user_can_prescribe() then
    raise exception 'You are not licensed to preform this action, this is an audited action' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists recordsweb_medication_prescriber_guard on public.medications;
create trigger recordsweb_medication_prescriber_guard
before insert on public.medications
for each row execute function public.recordsweb_require_prescriber_for_new_medication();

create or replace function public.recordsweb_require_licensed_fit_note_issuer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_fit_note boolean;
begin
  v_is_fit_note := coalesce(new.document_type, '') = 'Fit Note'
    or coalesce(new.category, '') = 'Fit Note';

  if v_is_fit_note and (auth.uid() is null or not public.recordsweb_current_user_can_issue_fit_note()) then
    raise exception 'You are not licensed to preform this action, this is an audited action' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists recordsweb_fit_note_licence_guard on public.documents;
create trigger recordsweb_fit_note_licence_guard
before insert or update on public.documents
for each row execute function public.recordsweb_require_licensed_fit_note_issuer();

revoke all on function public.recordsweb_require_prescriber_for_new_medication() from public, anon, authenticated;
revoke all on function public.recordsweb_require_licensed_fit_note_issuer() from public, anon, authenticated;
