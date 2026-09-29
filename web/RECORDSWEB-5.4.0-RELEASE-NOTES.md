# RecordsWeb 5.4.0 — Ro-School

RecordsWeb 5.4.0 adds **Ro-School** as a first-class RecordsWeb organisation type and product for school/education roleplay communities.

## New organisation type

Platform Management can now create organisations using:

- Organisation type: `School / Education (Ro-School)`
- Product package: `Ro-School`
- System mode: `school`
- Product entitlement: `school`

New communities continue to use the RecordsWeb `XX.XX` organisation-code format and their existing wildcard community portal, for example `SC.H1` → `sc-h1.recordsweb.org`.

## Ro-School workspace

The new `/#/school` workspace includes:

- Ro-School dashboard
- Pupil roll and pupil records
- Classes, form/tutor groups and teaching-group membership
- AM registration
- PM registration
- Lesson registers
- Attendance marks, late minutes and notes
- Attendance summary and percentage view
- Weekly timetable management
- School-specific global search and navigation

Ro-School is designed as a roleplay/simulation operations feature. It is not a statutory school MIS and does not provide DfE reporting.

## School staff roles

School organisations can use school-specific roles including Headteacher, Deputy Headteacher, Assistant Headteacher, Head of Year, Head of Department, Teacher, Cover Supervisor, Teaching Assistant, SENCO, Designated Safeguarding Lead, Pastoral Manager, Attendance Officer, Examinations Officer, Data Manager, School Business Manager and Reception / Office Staff.

## Platform changes

- RecordsWeb Complete and Tester Programme now support Clinical, Policing and Ro-School.
- Product switching includes Ro-School.
- Public request-access forms can request a School / Education organisation and Ro-School product.
- Platform product management supports standalone Ro-School and custom combinations.
- The Cloudflare wildcard Worker does not require a change for this release.

## Database

Run:

```text
supabase/recordsweb-5.4.0-ro-school.sql
```

Then redeploy these Supabase Edge Functions:

```text
recordsweb-platform-admin
recordsweb-admin
```

The migration adds the Ro-School product/system mode, school staff roles, school operational tables and row-level-security policies.
