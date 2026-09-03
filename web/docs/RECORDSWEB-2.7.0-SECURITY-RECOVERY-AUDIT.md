# RecordsWeb 2.7.0 — security, recovery and audit additions

This release keeps the existing RecordsWeb interface and adds security/workflow capabilities behind the same panels, modals and title-bar controls. It remains prototype/roleplay clinical software and is not certified for real patient care.

## Included

- Functional **Username reminder** and **Reset password** on the compact sign-in window using a separate six-digit account-recovery code. No real `@GW.HC` mailbox is required.
- Recovery codes are hashed in Supabase and verified only through the server-side `recordsweb-admin` Edge Function. Five failed recovery attempts cause a 15-minute recovery lock.
- Management password resets are temporary and force the staff member to choose a new password on next sign-in.
- Stronger password policy, prevention of reuse of the five most recently recorded passwords, and workstation failed-sign-in throttling.
- Automatic inactivity lock with password unlock; the timeout is configurable in Settings.
- Realtime patient-presence indication when another staff member has the same patient record open. This is an awareness indicator, not a hard record lock.
- Immutable audit trail for patient access, clinical changes, medication changes, appointments, messages, account activity, printing and PDF export. Management can search the organisation-wide audit log.
- Consultation draft autosave plus unsaved-change warnings.
- Patient clinical alerts shown in the normal patient-record banner/summary and maintained through Diary.
- Notification centre in the existing title-bar bell position.
- Document version history.
- Recoverable deletion infrastructure with Management restore for supported record types.
- Management system-status checks for Supabase, updater, audit/storage and admin-service dependencies.
- Existing four-digit prescribing PIN remains required for each medication create/edit operation.

**Break-glass access is intentionally NOT included in this release.**

## Supabase deployment

1. Open the Supabase SQL editor and run:

   `supabase/recordsweb-2.7.0.sql`

2. Redeploy the updated server-side admin function from the project folder:

   ```powershell
   supabase functions deploy recordsweb-admin
   ```

3. Restart RecordsWeb. Existing users should open **Account & Security** and create a six-digit recovery code before relying on the sign-in recovery links.

The service-role key remains inside the Supabase Edge Function environment and must never be placed in a `VITE_` environment variable or shipped with Electron.
