-- RecordsWeb 3.2.9 — GP problem catalogue integration
-- Run after recordsweb-3.2.8-medication-consultation-workflow.sql.
-- Adds reference description/significance support when a consultation creates
-- a new patient problem. The problem catalogue itself is bundled client-side.

begin;

create or replace function public.recordsweb_create_consultation_with_problem(
  p_patient_id uuid,
  p_payload jsonb,
  p_existing_problem_id uuid default null,
  p_new_problem_name text default null,
  p_new_problem_notes text default null,
  p_new_problem_significance text default null
)
returns public.consultations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_problem public.problems%rowtype;
  v_consultation public.consultations%rowtype;
  v_problem_name text;
  v_problem_notes text;
  v_problem_significance text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.recordsweb_billing_write_allowed() then
    raise exception 'RecordsWeb is in read-only mode because this organisation does not currently have write access.' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and active = true;

  if not found then
    raise exception 'Your RecordsWeb profile is not active.';
  end if;

  if not exists (
    select 1
    from public.patients p
    where p.id = p_patient_id
      and p.organisation_id = v_profile.organisation_id
  ) then
    raise exception 'Patient is not available to your organisation.';
  end if;

  if p_existing_problem_id is not null then
    select * into v_problem
    from public.problems p
    where p.id = p_existing_problem_id
      and p.patient_id = p_patient_id;

    if not found then
      raise exception 'The selected patient problem could not be found.';
    end if;
  else
    v_problem_name := left(trim(coalesce(p_new_problem_name, '')), 240);
    v_problem_notes := left(trim(coalesce(p_new_problem_notes, '')), 1000);
    v_problem_significance := left(trim(coalesce(p_new_problem_significance, '')), 40);

    if v_problem_name <> '' then
      select * into v_problem
      from public.problems p
      where p.patient_id = p_patient_id
        and lower(trim(p.name)) = lower(v_problem_name)
        and lower(coalesce(p.status, 'Active')) <> 'inactive'
      order by p.created_at desc
      limit 1;

      if not found then
        insert into public.problems (
          patient_id,
          name,
          onset_date,
          status,
          significance,
          notes
        ) values (
          p_patient_id,
          v_problem_name,
          current_date,
          'Active',
          coalesce(nullif(v_problem_significance, ''), 'Minor'),
          coalesce(nullif(v_problem_notes, ''), 'Created automatically from a RecordsWeb consultation.')
        )
        returning * into v_problem;
      end if;
    end if;
  end if;

  insert into public.consultations (
    patient_id,
    problem_id,
    date,
    clinician,
    location,
    type,
    status,
    entries
  ) values (
    p_patient_id,
    v_problem.id,
    coalesce(nullif(p_payload->>'date','')::timestamptz, now()),
    coalesce(nullif(p_payload->>'clinician',''), v_profile.display_name, v_profile.username),
    nullif(p_payload->>'location',''),
    nullif(p_payload->>'type',''),
    coalesce(nullif(p_payload->>'status',''), 'Complete'),
    coalesce(p_payload->'entries', '[]'::jsonb)
  )
  returning * into v_consultation;

  return v_consultation;
end;
$$;

revoke all on function public.recordsweb_create_consultation_with_problem(uuid, jsonb, uuid, text, text, text) from public, anon;
grant execute on function public.recordsweb_create_consultation_with_problem(uuid, jsonb, uuid, text, text, text) to authenticated;

commit;
