# RecordsWeb 3.8.1 — Clinical action licensing

Medication creation is restricted to doctor roles and Advanced Clinical Practitioners. Fit notes are restricted to those roles plus registered-nurse roles.

Unauthorised attempts show exactly:

`You are not licensed to preform this action, this is an audited action`

Denied UI attempts are written to the audit trail as `clinical.licensed_action.denied`.

No staff-capacity or seat-limit feature is included in this release.
