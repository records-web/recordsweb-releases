# RecordsWeb 3.3.9 — Provider Comments & Decision Email Fix

Website-only update. Version remains **3.3.9**.

## Changes

- Adds a separate **Comments from the provider** field to `/review-request`.
- Provider comments are public-facing and are included in approval/denial emails when supplied.
- Existing **Reviewer notes** remain private and are never included in applicant emails.
- Approval and denial emails continue to use the `noreply` Nodemailer configuration.
- Denial delivery now uses an explicit declined subject, accepts `denied` as an alias for `declined`, and automatically retries once using plain text if the first HTML SMTP attempt fails.
- Existing received and approval email tracking remains unchanged.

## SQL

Run `supabase/recordsweb-3.3.9-provider-comments-decision-email-fix.sql` once before deploying the updated website.
