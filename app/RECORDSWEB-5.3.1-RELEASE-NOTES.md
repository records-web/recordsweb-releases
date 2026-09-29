# RecordsWeb 5.3.1 — Dedicated Portal Root Routing

RecordsWeb 5.3.1 corrects the community-subdomain entry flow introduced with dedicated portals.

## Behaviour

- `https://gw-hs.recordsweb.org` now renders the `GW.HS` sign-in screen directly when signed out.
- Community portals no longer require or expose `/#/login` as their canonical sign-in URL.
- Unauthenticated requests to protected community routes return to the bare community hostname for sign-in, while preserving the requested route for post-login navigation.
- After a normal community-domain sign-in, RecordsWeb enters `/#/home`.
- Signed-in community pages continue to use hash routes such as `/#/patients`, `/#/management`, and `/#/policing`.
- `recordsweb.org` continues to render the public RecordsWeb homepage.
- The organisation selector is hidden on dedicated community subdomains because the hostname is the organisation boundary.
- The bare dedicated hostname never falls back to the generic organisation-code setup screen; an unknown/inactive hostname stays on the login shell and surfaces the organisation validation error there.

## Infrastructure

No additional database migration is required. Keep the RecordsWeb 5.3.0 organisation identifier migration installed. The Cloudflare wildcard Worker can continue proxying `*.recordsweb.org` to the Vercel origin.
