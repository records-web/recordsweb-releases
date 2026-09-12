# RecordsWeb 3.3.9 — amended request decisions and denial email fix

Website-only update. Version remains 3.3.9.

## Behaviour

- Approved and Denied are no longer terminal states. A reviewer can change Approved -> Denied or Denied -> Approved.
- Every decision change creates a new database decision revision.
- Each new revision sends one applicant email.
- If the previous decision was already emailed, the new message is explicitly labelled as an amended decision and states that it supersedes the previous email.
- Re-saving the same Approved/Denied status does not create a new revision. Clicking the current outcome button is an explicit Send / retry action and forces a fresh copy even when an older send timestamp exists.
- Historic `approved_email_sent_at` / `declined_email_sent_at` values are retained. They no longer permanently block a later amended decision.
- Denial delivery uses the same noreply SMTP account as the working approval email, opens a fresh SMTP connection on retry, and retries once as plain text if the first HTML send fails.
- The initial denial subject is deliberately `RecordsWeb deployment request update — ...`; the email body clearly states that the request is denied. This reduces the chance of aggressive mail filtering while keeping the outcome unambiguous.

## SQL

Run `supabase/recordsweb-3.3.9-decision-amendments-denial-email-fix.sql`.
