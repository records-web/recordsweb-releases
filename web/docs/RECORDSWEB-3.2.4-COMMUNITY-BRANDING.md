# RecordsWeb 3.2.4 — Community Branding

RecordsWeb now supports organisation-scoped community branding while preserving the RecordsWeb product identity.

## What a community can customise

Management -> Community branding can change:

- Community icon/logo
- Primary interface colour
- Navigation colour
- Patient banner colour

The community icon replaces the standard RecordsWeb icon on that organisation's sign-in screen and signed-in staff header. The text `RecordsWeb` remains fixed.

Brand settings are stored against the current organisation and are not shared with other communities.

## What remains official RecordsWeb branding

- Product name: RecordsWeb
- Public RecordsWeb website/homepage
- Access request review area
- Platform management area
- Default RecordsWeb icon/colours when no community customisation exists

## Supabase migration

Run:

```sql
supabase/recordsweb-3.2.4-community-branding.sql
```

The migration removes the previous fixed-branding trigger, restores management-only Storage upload/update/delete policies for `recordsweb-branding`, makes the branding bucket publicly readable for the pre-login community icon, and updates `recordsweb_public_organisation_config` to return the selected community branding.

Community logo objects are constrained to the current organisation UUID folder.

## Logo requirements

Accepted formats:

- PNG
- JPEG
- WebP

Maximum size: 4 MB.

## Reset behaviour

Selecting `Restore RecordsWeb defaults` removes the community logo and restores:

- Primary: `#0f6fbd`
- Navigation: `#cfe7f8`
- Patient banner: `#753b0d`
