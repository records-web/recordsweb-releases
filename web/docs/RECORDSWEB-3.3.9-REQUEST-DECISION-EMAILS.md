# RecordsWeb 3.3.9 — automated request decision emails

The website request-review workflow now notifies the applicant automatically when an authorised RecordsWeb reviewer changes a deployment request to **Approved** or **Declined**.

## Flow

1. The reviewer signs into `/#/review-request`.
2. The reviewer selects **Approve** or **Decline**.
3. `recordsweb_review_access_request` saves the decision in Supabase.
4. The browser calls `/api/request-outcome` with the reviewer Supabase bearer token.
5. The server verifies `recordsweb_is_access_request_reviewer()` before sending any message.
6. The `noreply@recordsweb.org` SMTP configuration sends the outcome email.
7. Supabase records `approved_email_sent_at` or `declined_email_sent_at`.

Private `operator_notes` are never inserted into applicant emails.

## Mailboxes

RecordsWeb continues to use only two SMTP/Nodemailer configurations:

- Contact form: `IONOS_CONTACT_SMTP_USER` / `IONOS_CONTACT_SMTP_PASSWORD`
- Deployment request mail (received + approved + declined): `IONOS_NOREPLY_SMTP_USER` / `IONOS_NOREPLY_SMTP_PASSWORD`

## SQL

Run `supabase/recordsweb-3.3.9-request-confirmation-email.sql` for the complete 3.3.9 request-email tracking columns. If `confirmation_email_sent_at` is already installed, the smaller `supabase/recordsweb-3.3.9-request-outcome-emails.sql` patch is sufficient.

## Failure behaviour

The request decision is saved before email delivery is attempted. SMTP failure therefore does not undo an approval or decline. The reviewer UI reports that the decision was saved but the notification failed, allowing the mail configuration to be corrected without losing the review result.
