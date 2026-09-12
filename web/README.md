# RecordsWeb

## RecordsWeb 3.4.0 — Discord Bot integration

- Adds one platform-owned **RecordsWeb Bot** that communities can install into their own Discord server.
- Community Management can allocate a maintenance channel, verify the bot connection and send a test message.
- Platform maintenance start/end changes automatically notify every connected community channel that has notifications enabled.
- Staff accounts can store a Discord User ID. Management can send newly-created or reset temporary login details by explicit Discord DM.
- Existing passwords are never retrieved or stored by the Discord integration; DM login sends only a newly-set temporary password and the user must change it at next sign-in.
- Run `supabase/recordsweb-3.4.0-discord-integration.sql`, deploy `recordsweb-discord`, and redeploy `recordsweb-admin`.
- Full setup is in `docs/RECORDSWEB-3.4.0-DISCORD-INTEGRATION.md`.

## RecordsWeb 3.3.9 — Shared Care + complete request email automation

- Version aligned at **3.3.9**.
- Shared Care supports multiple simultaneous GP, Hospital and Ambulance / PHEM links, including networks of three or more communities.
- All existing Shared Care security remains direct-link based: every relationship requires mutual approval and patient records are linked individually.
- The public deployment request form automatically emails the applicant from `noreply@recordsweb.org` after the request is safely stored.
- Approving or declining a request in `/review-request` now automatically sends a branded decision email from the same `noreply@recordsweb.org` request mailer.
- Approval/decline messages never expose private reviewer notes.
- Decision emails are tracked with `approved_email_sent_at` / `declined_email_sent_at` so normal retries and refreshes do not intentionally send duplicates.
- Contact and deployment-request mail remain two separate Nodemailer/SMTP configurations.
- Run `supabase/recordsweb-3.3.9-request-confirmation-email.sql` once, or `supabase/recordsweb-3.3.9-request-outcome-emails.sql` if the confirmation column is already installed.


## RecordsWeb 3.3.6 — Shared Care Network

- Adds Management → **Shared Care** with permanent six-character community codes, bilateral approval, suspend/revoke controls and directional clinical sharing permissions.
- Primary Care, Secondary Care and Ambulance / PHEM communities can interlink in any combination.
- Adds Patient → **Shared Care** with confirmed patient-to-patient linking and audited read-only partner records.
- Suggested patient matches use Roblox identity, NHS number, or exact name + DOB; no patient is automatically merged.
- Adds Ambulance / PHEM organisation mode and staff roles.
- Run `supabase/recordsweb-3.3.6-shared-care.sql`, then redeploy `recordsweb-admin` and `recordsweb-platform-admin`.

## RecordsWeb 3.3.6 — public automated service status

- Added a public `/status` page with RecordsWeb styling.
- Status is calculated automatically from live service checks; there is no manual operational toggle.
- Monitors the web deployment, Supabase authentication/data/storage, the RecordsWeb API/Roblox bridge, and GitHub release delivery.
- Refreshes automatically every 30 seconds and surfaces currently detected incidents.
- Added Status links to the public website navigation and footer.
- No SQL migration required.

# RecordsWeb Web

**Version:** 3.4.0  
**Runtime:** Browser / Vite / React  
**Deployment:** Multi-organisation

RecordsWeb Web is the browser-hosted version of the RecordsWeb clinical records platform. It keeps the existing RecordsWeb desktop visual language and clinical workflow while supporting multiple approved organisations through an `@XX.XX` organisation extension.

## RecordsWeb 3.3.5 — problems history, messaging contrast & web fit-note export

- Screen Messages now remain readable in dark mode; the message preview no longer renders light text on a white panel.
- Problems now store and display both a **Start date** and **End date**. Past/Resolved problems require an end date.
- The Problems record now has separate **Active Problems** and **Past Problems** tabs.
- New Consultation and Patient Summary only treat genuinely Active problems as active.
- Website fit-note Print / Save PDF now works with the site's CSP by triggering the browser print dialog without blocked inline JavaScript.
- The v3.3.4 Roblox appointment-terminal API repair and Sex/Gender RP identity scripts are bundled into this release.
- Run `supabase/recordsweb-3.3.5-problem-end-dates.sql` before using problem end dates.

## RecordsWeb 3.3.4 — community-scoped Roblox RP patient identities

- Each Roblox UserId can now have one persistent roleplay patient identity per RecordsWeb community.
- The same Roblox player can have a completely separate identity in another community.
- The game API supports `identity-get`, `identity-resolve`, `identity-register`, and `identity-update`.
- A first-time Roblox patient is created as a normal RecordsWeb patient record and re-used on later sessions.
- Management can enable/disable persistent RP patient identities and see the current linked-identity count.
- The Management panel now advertises the Cloudflare endpoint `https://api.recordsweb.org` by default.
- Run `supabase/recordsweb-3.3.4-roblox-patient-identities.sql` and redeploy `recordsweb-roblox-admin` plus `recordsweb-game-api`.
- The previously corrupted Nano ID lockfile entry has also been repaired so npm/Vercel/GitHub Actions do not request the nonexistent `nanoid-3.3.38.tgz`.


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


## 3.3.9 Provider Comments & Decision Email Fix

See `docs/RECORDSWEB-3.3.9-PROVIDER-COMMENTS-DECISION-EMAIL-FIX.md`. Run `supabase/recordsweb-3.3.9-provider-comments-decision-email-fix.sql` before deploying this website build.
