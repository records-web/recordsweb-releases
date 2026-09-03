# RecordsWeb 3.1.8 — Reception waiting timer

The Appointment Book now shows a live **Wait** timer for patients checked in at reception.

- Right-clicking an appointment and choosing **Mark patient arrived** starts the timer.
- The timer is persisted in `appointments.wait_started_at`, so it survives navigation, refreshes, and application restarts.
- The timer updates every second while the appointment remains in **Arrived / Patient in reception** state.
- Sending the patient in, marking them left, recording a walk-out, cancelling the slot status, or otherwise changing away from **Arrived** stops and clears the active wait timer.
- Waiting time is visually escalated after 10 minutes and again after 20 minutes.
- Existing arrived appointments are backfilled from `updated_at` by the migration because older versions did not store the exact arrival timestamp.

Database migration: `supabase/recordsweb-3.1.8.sql`.
