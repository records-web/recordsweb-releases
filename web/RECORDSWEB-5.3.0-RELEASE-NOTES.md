# RecordsWeb 5.3.0 — Organisation codes & dedicated portals

RecordsWeb 5.3.0 gives newly created communities a unique four-character organisation code in the existing RecordsWeb `XX.XX` format. Each character can be a letter or number. Examples include `GW.HS`, `RW.PS`, `UH.S1` and `A7.K2`.

The organisation code remains the login namespace, so staff usernames continue to look like `gus.farnsworth@GW.HS` or `gus.farnsworth@UH.S1`.

## Dedicated web portal

The same code is converted to a DNS-safe one-label subdomain by replacing the dot with a hyphen:

- `GW.HS` -> `https://gw-hs.recordsweb.org`
- `UH.S1` -> `https://uh-s1.recordsweb.org`

No per-community Cloudflare API call is required. Configure `*.recordsweb.org` once and configure the web host to accept the wildcard hostname. RecordsWeb converts an `xx-xx.recordsweb.org` hostname back to `XX.XX` before the sign-in screen loads.

## Community creation

Platform Management allocates a unique `XX.XX` code automatically when a community is created. There are 36 possible values for each of the four positions (`A-Z` and `0-9`), giving 1,679,616 possible codes before uniqueness filtering.

The reserved operator remains `gus.farnsworth@<ORG CODE>`.

## Supabase Auth compatibility

The visible RecordsWeb username always remains in `first.last@XX.XX` form. For codes containing digits, RecordsWeb can use an internal `recordsweb.org` Auth alias while keeping `profiles.username` unchanged. Sign-in accepts existing direct Auth identities and the internal alias form, preserving compatibility.
