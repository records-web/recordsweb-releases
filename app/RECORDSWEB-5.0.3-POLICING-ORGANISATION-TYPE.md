# RecordsWeb 5.0.3 — Policing organisation type

This hotfix makes **Policing** a first-class RecordsWeb organisation type (`system_mode = policing`).

Changes:
- Platform Management create/edit community forms now include **Policing**.
- Public access requests can select **Policing** directly.
- Organisation settings preserve Policing rather than falling back to Primary Care.
- Platform Discord targeting/labels recognise Policing communities.
- `recordsweb-platform-admin` accepts and validates `policing`.
- Supabase migration updates organisation and request constraints/normalisation.

## Deploy
1. Run `supabase/recordsweb-5.0.3-policing-organisation-type.sql` in the Supabase SQL editor.
2. Redeploy `recordsweb-platform-admin`:
   `supabase functions deploy recordsweb-platform-admin --no-verify-jwt --project-ref cdakocrmfstsknbgugkc`
3. Rebuild/redeploy Website and Electron.
