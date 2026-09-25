-- RecordsWeb 5.0.2 — Policing staff roles and role constraints
-- Adds British policing ranks/operational roles to profiles while retaining all Clinical roles.

begin;

alter table public.profiles drop constraint if exists profiles_role_allowed;
alter table public.profiles drop constraint if exists profiles_roles_allowed;

alter table public.profiles
  add constraint profiles_role_allowed check (role in ('GP Partner','Practice Manager','Assistant Manager','General Practitioner','GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse','Advanced Clinical Practitioner','Clinical Pharmacist','General Practice Nurse','Nurse Associate','Healthcare Assistant','Patient Coordinator','Chief Executive Officer','Deputy Chief Executive Officer','Chief Operations Officer','Medical Director','Director of Nursing','Consultant','Registrar (ST4-ST9)','Charge Nurse','Staff Nurse','PHEM Consultant','PHEM Doctor','Critical Care Paramedic','Advanced Paramedic','Paramedic','Emergency Medical Technician','Emergency Care Assistant','Dispatcher','Clinical Team Leader','Operations Manager','Chief Constable','Deputy Chief Constable','Assistant Chief Constable','Chief Superintendent','Superintendent','Chief Inspector','Inspector','Sergeant','Police Constable','Detective Chief Superintendent','Detective Superintendent','Detective Chief Inspector','Detective Inspector','Detective Sergeant','Detective Constable','Special Constable','Police Community Support Officer','Custody Sergeant','Detention Officer','Control Room Operator','Police Staff'));

alter table public.profiles
  add constraint profiles_roles_allowed check (
    cardinality(roles) >= 1
    and roles <@ array['GP Partner','Practice Manager','Assistant Manager','General Practitioner','GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse','Advanced Clinical Practitioner','Clinical Pharmacist','General Practice Nurse','Nurse Associate','Healthcare Assistant','Patient Coordinator','Chief Executive Officer','Deputy Chief Executive Officer','Chief Operations Officer','Medical Director','Director of Nursing','Consultant','Registrar (ST4-ST9)','Charge Nurse','Staff Nurse','PHEM Consultant','PHEM Doctor','Critical Care Paramedic','Advanced Paramedic','Paramedic','Emergency Medical Technician','Emergency Care Assistant','Dispatcher','Clinical Team Leader','Operations Manager','Chief Constable','Deputy Chief Constable','Assistant Chief Constable','Chief Superintendent','Superintendent','Chief Inspector','Inspector','Sergeant','Police Constable','Detective Chief Superintendent','Detective Superintendent','Detective Chief Inspector','Detective Inspector','Detective Sergeant','Detective Constable','Special Constable','Police Community Support Officer','Custody Sergeant','Detention Officer','Control Room Operator','Police Staff']::text[]
    and role = any(roles)
  );

comment on constraint profiles_role_allowed on public.profiles is
  'RecordsWeb 5.0.2 permitted Clinical and British Policing primary roles.';
comment on constraint profiles_roles_allowed on public.profiles is
  'RecordsWeb 5.0.2 permitted multi-role Clinical and British Policing assignments.';

commit;
