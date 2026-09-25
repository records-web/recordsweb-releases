# RecordsWeb 5.0.2 — Policing UI & British Roles

## Changes

- Prevents white-on-white controls across RecordsWeb Policing dark mode, including Search, form actions and record action buttons.
- Adds British policing ranks and operational roles to Policing staff management.
- Policing staff-role selection is shown when Management is opened from the Policing product.
- Complete communities preserve hidden Clinical roles while Policing roles are edited.
- Policing-only communities default new staff to Police Constable.
- New Policing-only communities initialise the reserved platform operator as Chief Constable.
- Adds Clinical Pharmacist to the Primary Care role constraint to match the RecordsWeb role catalogue.

## Deployment

1. Run `supabase/recordsweb-5.0.2-policing-roles-ui.sql` in Supabase SQL Editor.
2. Redeploy `recordsweb-admin`.
3. Redeploy `recordsweb-platform-admin`.
4. Deploy/rebuild the Website and Electron source as normal.

No new Supabase secrets are required.
