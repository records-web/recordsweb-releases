# RecordsWeb 3.2.9 — Problem Catalogue & Platform Operator Access

## Included updates

- GP problem lookup is now available when adding/editing a patient problem and when creating a consultation.
- Search-as-you-type suggestions show the supplied problem name, description and Minor/Severe reference classification.
- Selecting a supplied problem carries its description/significance into the new problem created from a consultation.
- Severe reference entries show an additional clinical warning. The catalogue is a lookup aid and does not replace assessment or triage.
- The supplied problem data contains 180 actual problem rows; RecordsWeb preserves those rows rather than inventing missing entries to reach the heading's stated 200.
- Specialist-medication warnings, medication search/history/cancel/re-authorise, consultation-to-problem linking, Stripe billing, payment exemptions and the 7-day failed-payment grace/read-only controls from prior releases are preserved.
- Payment exemption now handles stale cancelled sandbox Stripe links after switching RecordsWeb to live Stripe, and detaches the old Stripe identifiers once exemption is safely applied.
- Platform Management now authorises both `gus.farnsworth@XX.XX` and `alfie-james@XX.XX`, where `XX.XX` must match the active organisation attached to the authenticated profile.
- Access-request review follows the same operator rule.

## Database updates

Run both v3.2.9 migrations after the v3.2.8 medication/consultation migration:

```sql
-- supabase/recordsweb-3.2.9-problem-catalogue.sql
-- supabase/recordsweb-3.2.9-platform-operator-access.sql
```

## Edge Function

Redeploy Platform Management after updating:

```powershell
supabase functions deploy recordsweb-platform-admin --project-ref cdakocrmfstsknbgugkc
```

## Alfie platform access

The authorisation rule does not create an authentication/profile account automatically. `alfie-james@XX.XX` must exist as an active Supabase Auth user and active RecordsWeb profile in the matching organisation. Once it exists, it can sign into `/platform-management`.
