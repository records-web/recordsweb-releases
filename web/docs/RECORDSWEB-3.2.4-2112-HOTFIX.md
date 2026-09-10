# RecordsWeb 3.2.4 — 21:12 UK hotfix bundle

This source bundle includes the three requested changes from 10 September 2026 from 21:12 UK time onward.

1. Community custom branding: when an organisation has a custom icon, the staff-facing sign-in and main application header show the community icon on its own. The standard RecordsWeb wordmark remains when no custom community icon is configured.
2. Staff account namespace: account creation now uses the signed-in staff member's active organisation code instead of relying solely on an installation-level namespace. The `recordsweb-admin` Edge Function remains authoritative and must be redeployed from this bundle for the server-side fix.
3. Organisation terminology: the public request form and platform/reviewer views now use `Primary Care (GP)` and `Secondary Care (Hospital)` while preserving the internal values `general_practice` and `hospital`.

After deploying this source, redeploy the updated admin function:

```bash
supabase functions deploy recordsweb-admin
```
