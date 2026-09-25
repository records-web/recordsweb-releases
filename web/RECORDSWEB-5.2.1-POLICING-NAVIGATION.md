# RecordsWeb 5.2.1 — In-app Policing record navigation

RecordsWeb Policing record links now open as normal in-app pages instead of creating a new browser tab or Electron window.

This applies to:

- Persons
- Vehicles
- Incidents
- Fixed Penalty Notices
- Crime Reports
- Intelligence
- Statements
- Evidence
- Arrests
- Warrants
- Seizures
- Custody
- BOLO / Wanted
- Briefings
- Dispatch / CAD
- links between related policing records

The existing React Router session remains active while moving between the register and detail page, so users are not asked to sign in again simply because they opened a record.

## Deployment

No SQL migration, new secret or Edge Function deployment is required. Rebuild/redeploy Website and Electron.
