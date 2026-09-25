# RecordsWeb 5.0.0 — Product Platform

RecordsWeb 5.0.0 changes RecordsWeb from a clinical-only product into a shared operations platform with separately entitled products.

## Products

- **RecordsWeb Clinical** — existing Primary Care, Hospital and Ambulance/PHEM functionality.
- **RecordsWeb Policing** — persons, vehicles, incidents, Fixed Penalty Notices, crime/intelligence/statement/evidence/arrest/warrant/seizure/custody/BOLO/briefing/dispatch registers.
- **RecordsWeb Complete** — Clinical and Policing enabled on one organisation.
- **Tester Programme** — platform-managed entitlement that unlocks all current products for QA/testing.

Clinical and policing data remain separate. Existing clinical tables are unchanged; policing uses dedicated `police_*` tables.

## Deployment

1. Run `supabase/recordsweb-5.0.0-products-policing.sql` in Supabase SQL Editor.
2. Deploy the updated platform admin function:
   `supabase functions deploy recordsweb-platform-admin --no-verify-jwt --project-ref cdakocrmfstsknbgugkc`
3. Deploy Website/Electron 5.0.0.
4. In Platform Management -> Products & Testers, assign product access to each community.

Existing organisations automatically remain on Clinical after the migration.

## Policing security

Policing tables use RLS and require both the signed-in user's organisation and that organisation's `policing` entitlement. Existing RecordsWeb billing write protection is also attached to policing tables when the billing guard is installed.

## Notes

RecordsWeb Policing is for roleplay/simulation use. It is not connected to real police systems. RecordsWeb Clinical remains roleplay/simulation software and must not be used for real patient records.
