# RecordsWeb 3.3.6 — Shared Care Network

RecordsWeb Shared Care links independent RecordsWeb communities without merging their databases or removing organisation ownership boundaries.

## Supported service types

All three service types can interlink in any combination:

- Primary Care (GP)
- Secondary Care (Hospital)
- Ambulance / PHEM

Examples include GP ↔ Hospital, Hospital ↔ Ambulance, GP ↔ Ambulance, and same-type links.

## Community linking

Management → **Shared Care** shows a permanent six-character alphanumeric code for the current community. Entering another community's code creates a **Pending** relationship. The other community must explicitly approve the request before Shared Care becomes active.

Knowing a code never grants record access by itself.

Relationship states:

- Pending
- Active
- Suspended
- Declined
- Revoked

Either linked Management team can suspend or revoke an active relationship. A suspended relationship can later be resumed.

## Sharing permissions

Each organisation controls its own outbound data. Permissions are directional and include:

- Problems
- Medication
- Consultations
- Investigations
- Documents (metadata only; private storage paths are not exposed)
- Referrals
- Care history
- Clinical alerts

The partner controls its own outbound permissions separately.

## Patient linking

Organisation linking does not automatically merge or expose every patient. Each local patient must be linked to the appropriate patient in the partner organisation.

RecordsWeb suggests possible matches using, in priority order:

1. the same community-scoped Roblox user identity when available;
2. the same NHS number;
3. exact first name + last name + date of birth.

A staff member must confirm the patient link. Removing a patient link does not delete either patient.

## Shared patient record

Patient → **Shared Care** shows linked partner records and an audited, read-only snapshot of data the partner has chosen to share. The source organisation and service type are always displayed.

Every Shared Care patient-record view is written to the RecordsWeb audit log.

## Database migration

Run:

`supabase/recordsweb-3.3.6-shared-care.sql`

The migration also enables the `ambulance` organisation mode and adds Ambulance / PHEM staff roles.

## Edge Functions

Because organisation creation and staff-role validation now understand Ambulance / PHEM mode, redeploy:

```powershell
supabase functions deploy recordsweb-admin --project-ref cdakocrmfstsknbgugkc
supabase functions deploy recordsweb-platform-admin --project-ref cdakocrmfstsknbgugkc
```

No service-role credentials are exposed to the Web or Electron renderer. Cross-community clinical reads are performed only by the migration's security-definer RPCs after validating the signed-in organisation, active organisation relationship, active patient link and directional permissions.
