# RecordsWeb 3.5.1 — Care Workspace Patient Workflow Polish

This release builds on the 3.5.0 care-specific workspaces. No additional database migration is required beyond `supabase/recordsweb-3.5.0-care-workspaces.sql`.

## Hospital
- Patient record navigation is now hospital-specific: Patient Summary, Clinical Notes, Medicines, Problems, Results, Admissions, Documents, Discharge and Shared Care.
- The patient toolbar now uses hospital actions such as Admissions and Ward Board rather than GP appointment actions.
- Hospital navigation now exposes Patients and New Patient directly.
- Admissions can create a new patient inline without leaving the workflow; the new patient is automatically selected for the admission.
- Hospital admission/discharge views can be opened pre-filtered to a patient.

## Ambulance / PHEM
- Patient record navigation is now incident-oriented: Patient Summary, ePCR / Incidents, Medicines, Medical History, Previous Care, Documents, Handover and Shared Care.
- Ambulance navigation exposes Patients and New Patient directly.
- Incident creation can create a patient inline and automatically link that patient to the new ePCR/incident.
- Patient-linked incident and handover links open filtered to that patient.

## UI fixes
- Corrected dark-mode contrast for Refresh, Cancel, Record, Discharge, handover and other secondary care-workspace buttons.
- Added a reusable RecordsWeb patient-creation modal for hospital and ambulance workflows.
- Primary Care navigation and login remain unchanged.
