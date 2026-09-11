# RecordsWeb 3.3.9 — Shared Care + automated request emails

## Deployment request emails

The public deployment request form saves the request first, then calls `/api/request-confirmation`. The mail endpoint looks up the saved request with the Supabase service role before sending, so it cannot be used as a generic arbitrary-email relay.

Two separate Nodemailer configurations are supported:

### Contact form

- `IONOS_CONTACT_SMTP_USER=contactus@recordsweb.org`
- `IONOS_CONTACT_SMTP_PASSWORD=...`
- `CONTACT_TO=contactus@recordsweb.org`

Legacy `IONOS_SMTP_USER` / `IONOS_SMTP_PASSWORD` remain fallback values for existing deployments.

### Deployment request mailer (received + approved + declined)

- `IONOS_NOREPLY_SMTP_USER=noreply@recordsweb.org`
- `IONOS_NOREPLY_SMTP_PASSWORD=...`
- optional `IONOS_NOREPLY_SMTP_HOST=smtp.ionos.co.uk`
- optional `IONOS_NOREPLY_SMTP_PORT=465`
- `RECORDSWEB_SUPPORT_EMAIL=contactus@recordsweb.org`
- `SUPABASE_URL=...`
- `SUPABASE_ANON_KEY=...` (server-side alias; `VITE_SUPABASE_ANON_KEY` remains supported as a fallback for reviewer verification)
- `SUPABASE_SERVICE_ROLE_KEY=...` (server-side Vercel environment variable only; never expose it as `VITE_...`)

Run `supabase/recordsweb-3.3.9-request-confirmation-email.sql` once. It now adds tracking for the received, approved and declined emails.

The request is never rolled back merely because SMTP fails. The same rule applies to decisions: approval/decline is saved first and the applicant email is attempted afterwards. Private reviewer notes are never included in automated decision emails.

When an authorised reviewer selects **Approve** or **Decline**, the website calls `/api/request-outcome`. The endpoint verifies the reviewer bearer token using `recordsweb_is_access_request_reviewer()` before using the server-side request mailer. `approved_email_sent_at` and `declined_email_sent_at` prevent normal duplicate notifications.

## Shared Care network

Shared Care from the earlier release is retained in full. Any service mode can create direct links with any other service mode:

- GP ↔ Hospital
- GP ↔ Ambulance / PHEM
- Hospital ↔ Ambulance / PHEM
- GP ↔ GP
- Hospital ↔ Hospital
- Ambulance ↔ Ambulance

A community can maintain multiple simultaneous active links, allowing networks of three or more communities, such as Ambulance ↔ Hospital ↔ GP. For a full three-way relationship, each desired direct relationship can be approved independently. RecordsWeb never silently forwards records through an intermediary community.

The existing six-character linking code, mutual approval, directional permissions, patient-level linking, read-only remote snapshots and audit logging are retained.

## Retained fixes/features

This build keeps the current RecordsWeb fixes and features from the source release, including the Problems Active/Past tabs and end dates, web fit-note print/save behaviour, dark-mode Screen Messages fix, Roblox community-scoped patient identities, appointment terminal API fixes, medication dosage/frequency/quantity improvements, billing/grace/read-only handling and the automated public status page.
