# RecordsWeb 3.4.4 — Ambulance / PHEM mode fix

This update keeps the 3.4.3 Problems redesign and fixes legacy backend validation that could reject an organisation when its type was changed to **Ambulance / PHEM**.

## Required database step

For an existing Supabase project, run:

`supabase/recordsweb-3.4.4-ambulance-mode-fix.sql`

The migration updates the `organisations_system_mode_allowed` constraint and organisation normalisation/provisioning functions so these values are accepted:

- `general_practice` — Primary Care (GP)
- `hospital` — Secondary Care (Hospital)
- `ambulance` — Ambulance / PHEM

## Required Edge Function deployment

Redeploy `recordsweb-platform-admin` so the current server-side validator is used.

```powershell
supabase functions deploy recordsweb-platform-admin --project-ref cdakocrmfstsknbgugkc
```
