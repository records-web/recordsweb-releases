# RecordsWeb 5.3.0 deployment

## 1. Database

Run `supabase/recordsweb-5.3.0-community-identifiers.sql` against the RecordsWeb Supabase project. This updates organisation-code validation to the canonical alphanumeric `XX.XX` format, including codes such as `GW.HS` and `UH.S1`, and refreshes platform-operator/reviewer identity checks.

## 2. Edge Functions

Deploy the updated `recordsweb-platform-admin`, `recordsweb-admin`, `recordsweb-security` and `recordsweb-discord` functions. Community creation now allocates a unique `XX.XX` identifier automatically.

## 3. Wildcard domain

Configure a wildcard DNS/hosting route for `*.recordsweb.org` once. Do not create a DNS record per community. The portal label is derived by replacing the code dot with a hyphen:

- `GW.HS` -> `gw-hs.recordsweb.org`
- `UH.S1` -> `uh-s1.recordsweb.org`

Explicit service hostnames such as `api.recordsweb.org`, `status.recordsweb.org` and `www.recordsweb.org` should remain explicit DNS/hosting routes.

## 4. Login format

RecordsWeb staff usernames remain unchanged in style: `first.last@GW.HS`, `first.last@UH.S1`, etc. Electron accepts the same `XX.XX` organisation code format.
