-- RecordsWeb 3.2.4 — Secondary Care nursing roles
-- Adds Charge Nurse and Staff Nurse to the existing Secondary Care role set.
-- Primary Care (GP) roles remain unchanged.

alter table public.profiles drop constraint if exists profiles_role_allowed;
alter table public.profiles drop constraint if exists profiles_roles_allowed;

alter table public.profiles add constraint profiles_role_allowed check (role in (
  'GP Partner','Practice Manager','Assistant Manager','General Practitioner',
  'GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse',
  'Advanced Clinical Practitioner','General Practice Nurse','Nurse Associate',
  'Healthcare Assistant','Patient Coordinator',
  'Chief Executive Officer','Deputy Chief Executive Officer','Chief Operations Officer',
  'Medical Director','Director of Nursing','Consultant','Registrar (ST4-ST9)',
  'Charge Nurse','Staff Nurse'
));

alter table public.profiles add constraint profiles_roles_allowed check (
  cardinality(roles) >= 1 and
  roles <@ array[
    'GP Partner','Practice Manager','Assistant Manager','General Practitioner',
    'GP Registrar (GPST2-3)','GP Registrar (GPST1)','Medical Student','Lead Nurse',
    'Advanced Clinical Practitioner','General Practice Nurse','Nurse Associate',
    'Healthcare Assistant','Patient Coordinator',
    'Chief Executive Officer','Deputy Chief Executive Officer','Chief Operations Officer',
    'Medical Director','Director of Nursing','Consultant','Registrar (ST4-ST9)',
    'Charge Nurse','Staff Nurse'
  ]::text[] and role = any(roles)
);
