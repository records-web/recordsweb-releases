# RecordsWeb 3.6.0 — Shared Care Workspaces

RecordsWeb 3.6.0 turns Shared Care into a collaborative care-network workspace rather than a set of isolated point-to-point links.

## Connected network behaviour

If active Shared Care links form a connected chain, RecordsWeb automatically places every participating community into the same workspace. For example:

```text
Hospital → GP
GP → Ambulance
Ambulance → Hospital
```

or even just:

```text
Hospital → GP → Ambulance
```

resolves to one Shared Care workspace containing all three communities.

Detailed clinical-record permissions remain direct-link based. Workspace membership enables collaboration, discussion, shared tasks and handover visibility; it does not silently grant an indirect organisation unrestricted access to another organisation's patient record.

## Workspace features

### Discussion

- Network-wide discussion for general Shared Care coordination.
- Patient-specific discussion threads when linked patient records form a connected chain.
- Every message displays the author, role, organisation, organisation extension and timestamp.
- Messages can be marked as Discussion, Clinical update or Request / question.

### Unified Clinical Timeline

The patient Shared Care page combines:

- local Problems, Medication, Consultations, Investigations, Documents, Referrals and Care History;
- directly permitted Shared Care partner records;
- patient-specific Shared Care clinical updates;
- cross-organisation tasks;
- transfers and handovers.

Every event retains source/provenance information.

### Shared Clinical Work Queue

Communities can create cross-organisation tasks with:

- receiving organisation;
- patient thread when applicable;
- priority;
- due date;
- task description;
- Open → Accepted → Completed workflow.

The receiving community sees these tasks inside its normal Clinical Work Queue as well as inside Shared Care.

### Transfer of Care acknowledgement

Structured handovers and transfers now support:

```text
Sent → Received → Viewed → Acknowledged → Actioned
```

The receiving organisation can explicitly acknowledge a handover before marking it actioned.

### Network view

The workspace shows every connected community, care type and organisation extension. This makes it clear when Primary Care, Hospital and Ambulance/PHEM records are participating in the same care network.

## Routes

Organisation workspace:

```text
/shared-care
```

Patient workspace:

```text
/patients/:patientId/shared-care
```

Shared Care is also available from the main navigation for Primary Care, Hospital and Ambulance/PHEM workspaces.

## Database migration

Run the existing 3.5.0 migration first if it has not already been applied:

```text
supabase/recordsweb-3.5.0-care-workspaces.sql
```

Then run:

```text
supabase/recordsweb-3.6.0-shared-care-workspaces.sql
```

The 3.6.0 migration creates persistent care-network workspaces, patient threads, discussion messages and shared tasks, and upgrades transfer-of-care records with workspace linkage and acknowledgement metadata.

## Discord Edge Function version

If `RECORDSWEB_VERSION` is set as a Supabase Edge Function secret, update it to:

```text
3.6.0
```

No change to the Discord integration architecture is required.
