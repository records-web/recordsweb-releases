# RecordsWeb 3.2.7 — Billing grace period and read-only suspension

RecordsWeb 3.2.7 adds automatic billing enforcement around Stripe subscription failures while preserving access to existing records.

## Behaviour

- Successful Stripe payment: organisation remains fully writable.
- Failed renewal/payment: organisation enters `overdue` with a 7-day grace period.
- During grace: all normal RecordsWeb features remain available and a warning banner shows the remaining grace period.
- When the grace period ends: the organisation becomes `suspended` and RecordsWeb switches to read-only mode.
- Read-only mode keeps existing patient and operational records viewable but blocks clinical/operational writes, appointments, staff-content changes, deletions/restores, document uploads and community branding changes.
- Paying the outstanding Stripe invoice restores `active` status and clears the grace/read-only timestamps automatically.
- Payment-exempt/complimentary communities are never restricted.
- Platform Management can still apply or remove payment exemption while an organisation is read-only.

## Database migration

Run after the 3.2.6 Stripe migration:

```text
supabase/recordsweb-3.2.7-billing-grace-readonly.sql
```

This migration adds:

- `billing_grace_started_at`
- `billing_grace_ends_at`
- `billing_read_only_since`
- `recordsweb_billing_write_allowed()`
- `recordsweb_refresh_billing_access_state()`
- database write-guard triggers
- read-only enforcement for RecordsWeb document/branding Storage writes

## Edge Functions to redeploy

```powershell
supabase functions deploy recordsweb-stripe-webhook --no-verify-jwt --project-ref cdakocrmfstsknbgugkc
supabase functions deploy recordsweb-stripe-billing --project-ref cdakocrmfstsknbgugkc
supabase functions deploy recordsweb-platform-admin --project-ref cdakocrmfstsknbgugkc
```

No additional Stripe webhook event types are required beyond the RecordsWeb 3.2.6 configuration.

## Testing the grace period

For a quick sandbox test, trigger an `invoice.payment_failed` event or temporarily set an organisation to `overdue`. The webhook sets a 7-day grace period.

To test read-only immediately without waiting 7 days, after a grace period exists you can move its end into the past in the SQL Editor:

```sql
update public.organisations
set billing_grace_ends_at = now() - interval '1 minute'
where org_code = 'GW.HC';
```

Refresh RecordsWeb. It will call `recordsweb_refresh_billing_access_state()`, store the organisation as `suspended`, and show the read-only banner.

To return the sandbox organisation to an active paid state for testing:

```sql
update public.organisations
set
  billing_status = 'active',
  billing_grace_started_at = null,
  billing_grace_ends_at = null,
  billing_read_only_since = null
where org_code = 'GW.HC';
```

In normal use, do not manually reset those fields: `invoice.paid` does it automatically.
