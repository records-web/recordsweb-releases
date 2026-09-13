# RecordsWeb 3.7.2 — Status monitoring

RecordsWeb 3.7.2 fixes a false degraded state for Supabase Storage and extends the public status page with Stripe Billing & Payments and Shared Care Network checks.

## Deployment

1. Run `supabase/recordsweb-3.7.2-status-health.sql` after the existing Shared Care migrations.
2. Redeploy the `recordsweb-stripe-billing` Edge Function so its GET health probe is available.
3. Deploy the web application normally.

The Storage check now sends the Supabase anon JWT in both the `apikey` and `Authorization` headers and treats expected non-5xx policy/auth responses as proof that the Storage gateway is available. HTTP 429 remains degraded and 5xx/network failures remain outages.
