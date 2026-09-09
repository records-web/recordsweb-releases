# RecordsWeb Web

**Version:** 3.2.0  
**Runtime:** Browser / Vite / React  
**Deployment:** Multi-organisation

RecordsWeb Web is the browser-hosted version of the RecordsWeb clinical records platform. It keeps the existing RecordsWeb desktop visual language and clinical workflow while supporting multiple approved organisations through an `@XX.XX` organisation extension.

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

`/#/review-request` provides the restricted operator interface for access requests. Server-side Supabase checks limit the review APIs and private logo access to reserved `gus.farnsworth@XX.XX` accounts whose suffix matches their active RecordsWeb organisation. Run `supabase/recordsweb-3.2.1-review-request.sql` after the public request migration.


## Fixed RecordsWeb branding

RecordsWeb uses one product-owned visual identity across every organisation. Organisation staff cannot replace the RecordsWeb logo or alter the product colour palette. Organisation names, extensions, modes and locations remain deployment-specific. Run `supabase/recordsweb-3.2.1-branding-lock.sql` once on existing Supabase deployments.


## RecordsWeb 3.2.2

- Website Platform Management can create approved communities.
- Creation automatically provisions the reserved `gus.farnsworth@XX.XX` Management account using a password entered by the platform operator.
- Requires `supabase/recordsweb-3.2.2-community-creation.sql` and the `recordsweb-platform-admin` Edge Function.

## RecordsWeb 3.2.2 community management

Website Platform Management can create, edit, enable/disable communities and manage the reserved `gus.farnsworth@XX.XX` operator account. Run `supabase/recordsweb-3.2.2-community-management.sql` and redeploy `supabase/functions/recordsweb-platform-admin/` before using the new controls. Organisation extensions remain immutable after creation.
