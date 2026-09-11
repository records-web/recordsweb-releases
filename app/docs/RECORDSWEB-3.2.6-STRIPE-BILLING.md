# RecordsWeb 3.2.6 — Stripe Sandbox Billing

RecordsWeb 3.2.6 connects organisation billing to Stripe while preserving a Platform Management payment-exemption option for communities that should never be charged.

## What is included

- RecordsWeb Web uses a branded custom Stripe Checkout page at `/billing/checkout`.
- RecordsWeb Electron opens Stripe-hosted Checkout in the user's external browser, avoiding payment fields inside the Electron `file://` context.
- Stripe webhooks synchronise subscription/payment state back to `public.organisations`.
- Management can open the Stripe Customer Portal after a Stripe customer exists.
- Platform Management can mark a community **Exclude this community from payment**. Exempt communities are stored as `billing_payment_exempt = true`, use the complimentary billing state, do not get a Stripe checkout button, and do not require a subscription.
- If an organisation already has a Stripe subscription, Platform Management attempts to cancel that subscription before applying the exemption. If Stripe cannot confirm the cancellation, RecordsWeb refuses to enable the exemption so future charges are not silently left running.
- The existing introductory offer is supported: £5 for the first month, with the normal £7 setup fee included, followed by the configured monthly price (normally £9.50).
- The optional announcement-board charge remains a one-off charge and is included at checkout when enabled and not already paid.

## 1. Database migration

Run these in order if 3.2.5 has not already been installed:

```text
supabase/recordsweb-3.2.5-pricing-billing.sql
supabase/recordsweb-3.2.6-stripe-billing.sql
```

The 3.2.6 migration adds the payment-exemption state, Stripe identifiers/status fields and payment timestamps. It also extends the existing billing-field protection trigger.

## 2. Stripe Sandbox keys

Create/use a Stripe Sandbox and copy its test keys. Configure the following as **Supabase Edge Function secrets**, not Vite variables and not Electron environment variables:

```powershell
supabase secrets set STRIPE_SECRET_KEY=sk_test_YOUR_KEY
supabase secrets set STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY
supabase secrets set RECORDSWEB_PUBLIC_URL=https://recordsweb.org
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to hosted Supabase Edge Functions by Supabase.

Never put `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or the Supabase service-role key in `VITE_*` variables.

## 3. Deploy the functions

From the project root:

```powershell
supabase functions deploy recordsweb-stripe-billing
supabase functions deploy recordsweb-stripe-webhook --no-verify-jwt
supabase functions deploy recordsweb-platform-admin
```

`supabase/config.toml` also marks `recordsweb-stripe-webhook` with `verify_jwt = false` because Stripe cannot supply a Supabase user JWT. The webhook still verifies every request with Stripe's webhook signature.

## 4. Create the Stripe webhook

In the Stripe Sandbox dashboard, create a webhook endpoint pointing to:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/recordsweb-stripe-webhook
```

Subscribe it to these events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
invoice.paid
invoice.payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Copy the endpoint signing secret and set it in Supabase:

```powershell
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
```

## 5. Customer Portal

Enable/configure the Stripe Customer Portal in the same Sandbox. Once an organisation has a Stripe customer, the RecordsWeb Billing panel exposes **Manage billing**, which creates a short-lived Stripe portal session server-side.

## 6. Payment exemptions

In RecordsWeb Platform Management:

1. Open **Billing** for the community.
2. Choose **Edit billing**.
3. Tick **Exclude this community from payment**.
4. Optionally enter an exemption reason.
5. Save.

The community will show **Payment exempt / No payment required** in its Billing panel. It cannot start a Stripe checkout while exempt.

If an existing Stripe subscription is attached, RecordsWeb cancels it before the exemption is written to the database. This requires `STRIPE_SECRET_KEY` to be configured for `recordsweb-platform-admin`.

To make a community chargeable again, untick the exemption and save the normal billing status/price. A new Stripe checkout can then be started if there is no active subscription.

## 7. Sandbox test

Use Stripe's Sandbox/test payment methods. The standard successful card test number is `4242 4242 4242 4242`, with a future expiry and any valid CVC.

After a successful checkout, confirm that:

- `stripe_customer_id` and `stripe_subscription_id` are populated.
- `stripe_subscription_status` becomes `active` (or the Stripe status returned for the test).
- `billing_status` becomes `active` for non-exempt communities.
- `stripe_last_payment_at` is set after payment.
- `billing_setup_fee_paid_at` is set when the setup fee is charged or included in the first-month offer.
- `billing_first_month_offer_redeemed_at` is set after the introductory offer is used.
- `billing_next_date` follows the Stripe subscription period end.

## Notes

The browser/client never decides that a payment succeeded. Stripe webhook events are the authoritative payment signal. RecordsWeb stores Stripe IDs and statuses but never stores a full card number.
