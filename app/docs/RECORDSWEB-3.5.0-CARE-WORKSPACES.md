# RecordsWeb 3.5.0 — Care-Specific Workspaces + Shared Care 2.0

RecordsWeb 3.5.0 introduces care-setting-specific workspaces while keeping the same RecordsWeb login page, authentication flow, patient identity model and core platform branding.

## Primary Care (GP)

Primary Care remains on the existing RecordsWeb workspace and navigation.

## Secondary Care (Hospital)

Hospital communities now receive an episode-first workspace with:

- Hospital Operations dashboard
- Ward Board
- Admissions workflow
- Discharge workload
- Bed / ward / clinician tracking
- Admission status progression
- Clinical Work Queue
- Direct access back to the patient's longitudinal RecordsWeb record

## Ambulance / PHEM

Ambulance communities now receive an incident-first workspace with:

- Active Incidents dashboard
- CAD-style incident references
- Priority and unit / call-sign fields
- ePCR observations timeline
- Treatment / intervention timeline
- Mobilised → on scene → assessing → treating → conveying → handover → closed workflow
- Destination and ETA handover workflow
- Shared Care handover shortcut
- Clinical Work Queue

## Shared Care 2.0

The patient Shared Care page now includes:

- Care Network view showing the local and linked RecordsWeb communities
- Clear source provenance on shared clinical sections
- Structured Transfer of Care events
- Ambulance handover, hospital discharge, care-plan update and clinical-update transfer types
- Received / viewed / actioned status tracking
- Audited transfer actions

Shared clinical data remains read-only unless it is explicitly transferred into a local workflow.

## Public website theme

The public RecordsWeb home page now has its own Light / Dark toggle. The preference is stored in `localStorage` as `recordsweb-public-theme`. It does not change the care-setting-specific login page; the login page remains the same for Primary Care, Hospital and Ambulance communities.

## Required database migration

Run:

```sql
supabase/recordsweb-3.5.0-care-workspaces.sql
```

This adds:

- `recordsweb_care_episodes`
- `recordsweb_care_work_items`
- `recordsweb_shared_care_transfers`

with organisation-scoped row-level security.

## Deployment

After applying the SQL migration, deploy the updated web app and/or build the updated Electron app. The existing Discord Edge Function can continue to be used; its default RecordsWeb version is now 3.5.0.

If you store `RECORDSWEB_VERSION` as a Supabase secret, update it to `3.5.0` before redeploying `recordsweb-discord`.
