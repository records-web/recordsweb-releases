# RecordsWeb Web

**Version:** 3.3.3  
**Runtime:** Browser / Vite / React  
**Deployment:** Multi-organisation

RecordsWeb Web is the browser-hosted version of the RecordsWeb clinical records platform. It keeps the existing RecordsWeb desktop visual language and clinical workflow while supporting multiple approved organisations through an `@XX.XX` organisation extension.

## RecordsWeb 3.3.3 — consultation medication prescribing

- The **Medication** section of an open consultation now has **Add medication** and opens the same prescribing workflow as the patient Medication record.
- Authorised drugs are added to the patient medication record immediately and are summarised into the consultation when it is saved.
- Specialist-drug authorisation, prescribing PIN, medicine search, typical/custom dosage, editable frequency, course duration and quantity calculation are reused unchanged.
- When automatic quantity cannot safely be calculated from the supplied reference, RecordsWeb now explains why and directs the prescriber to Custom quantity/Custom dosage instead of leaving an unexplained disabled control.
- No new SQL migration is required for 3.3.3.

## RecordsWeb 3.3.3 — dosage frequency & quantity

- Typical dosage frequency is now an editable numeric field labelled **Frequency per day (ONLY CHANGE THE NUMBER)**.
- Changing frequency updates the prescribed regimen and the automatic tablet/capsule quantity calculation.
- Course duration remains editable, so 5-day, 7-day and other authorised courses calculate correctly.
- Example: 500 mg dose ÷ 500 mg capsule × 4 times/day × 7 days = **28 capsules**.
- Website tab switching no longer triggers a focus billing refresh, and detected web updates no longer auto-reload the page; updates are manual to protect unsaved typed text.

## RecordsWeb 3.3.3 — problems & platform access

- Search-as-you-type GP problem reference lookup in Problems and New Consultation.
- Supplied problem descriptions and Minor/Severe reference classification are shown when a catalogue result is selected.
- New consultation problems are linked into the patient Problems record with catalogue description/significance.
- Platform Management now accepts both `gus.farnsworth@XX.XX` and `alfie.james@XX.XX` when the suffix matches the user's active organisation.
- Payment-exemption handling safely clears stale cancelled sandbox Stripe identifiers after a switch to live Stripe.
- Prior v3.2.8 medication search, specialist-drug warning/authorisation, medication history, cancellation and re-authorisation remain included.


## Included in 3.2.0

- Multi-organisation organisation selection and isolation
- First-visit organisation setup in the browser
- **Change organisation** option on the signed-out login screen
- Dynamic login namespaces such as `first.last@GW.HC` or `first.last@AB.CD`
- Dynamic organisation name, code, location, branding and logo
- `general_practice` / `hospital` organisation mode metadata
- Organisation-scoped Supabase clinical data and Storage paths
- Organisation-aware Management account creation and recovery
- Patient Search and Patient Summary
- Problems, Consultations and New Consultation template
- Medication, Care History and Diary
- Individually separated Documents and Fit Notes
- Investigations and Referrals
- Appointment Book with A / S / L / W statuses
- Persistent check-in wait timer
- Staff Area, Management, Security and Settings
- Realtime features and staff messaging
- Supabase-driven **RecordsWeb needs an update** web refresh system
- Safe automatic update deferral while unsaved work is open
- Windows/macOS platform detection for direct desktop installer downloads
- Open Graph/social link preview metadata

The existing RecordsWeb UI is retained. The organisation `system_mode` field is available for GP/Hospital-specific interfaces without changing the current clinical UI in this build.

See `WEB-DEPLOYMENT.md` and `docs/RECORDSWEB-3.2.0-WEB-MULTI-ORGANISATION.md` before deploying.


## Public homepage and access requests

The web root is now a public RecordsWeb overview. Staff enter through **Staff sign in**. Run `supabase/recordsweb-3.2.1-public-access-requests.sql` to enable the public Request access form and private community-logo uploads.

### Access request review

`/#/review-request` provides the restricted operator interface for access requests. Server-side Supabase checks limit the review APIs and private logo access to authorised `gus.farnsworth@XX.XX` or `alfie.james@XX.XX` accounts whose suffix matches their active RecordsWeb organisation. Run `supabase/recordsweb-3.2.1-review-request.sql` after the public request migration.


## Fixed RecordsWeb branding

RecordsWeb uses one product-owned visual identity across every organisation. Organisation staff cannot replace the RecordsWeb logo or alter the product colour palette. Organisation names, extensions, modes and locations remain deployment-specific. Run `supabase/recordsweb-3.2.1-branding-lock.sql` once on existing Supabase deployments.


## RecordsWeb 3.2.2

- Website Platform Management can create approved communities.
- Creation automatically provisions the reserved `gus.farnsworth@XX.XX` Management account using a password entered by the platform operator.
- Requires `supabase/recordsweb-3.2.2-community-creation.sql` and the `recordsweb-platform-admin` Edge Function.

## RecordsWeb 3.2.2 community management

Website Platform Management can create, edit, enable/disable communities and manage the reserved `gus.farnsworth@XX.XX` operator account. Run `supabase/recordsweb-3.2.2-community-management.sql` and redeploy `supabase/functions/recordsweb-platform-admin/` before using the new controls. Organisation extensions remain immutable after creation.

## RecordsWeb 3.2.3 — Roblox integration

Community Management now includes a per-organisation Roblox integration for waiting-room patient-call displays. See `docs/RECORDSWEB-3.2.3-ROBLOX-INTEGRATION.md` and run `supabase/recordsweb-3.2.3-roblox-integration.sql` before deploying the two Roblox Edge Functions.

## RecordsWeb 3.3.3 — dosage & quantity calculator

- Typical prescribed dosage options are generated from the supplied GP MEDS reference.
- Numeric dose ranges such as Prednisolone 30–40 mg once daily become selectable 30 mg and 40 mg typical options.
- Tablet/capsule quantity can be calculated from dose ÷ strength × frequency/day × course duration.
- Prescribers can switch to Custom dosage and Custom quantity at any time.
- Pack/tablet strength is deliberately entered by the clinician because GP MEDS.pdf supplies reference doses, not medicine pack strengths.
- No new database migration is required for 3.3.3; the final prescribed dosage and quantity continue to use the existing medication fields and PIN-authorised workflow.
