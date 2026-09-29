# RecordsWeb 5.3.1 — Community Portal Deployment

RecordsWeb 5.3.1 keeps Cloudflare authoritative DNS and routes organisation hostnames through a Cloudflare Worker to the Vercel website origin.

## Request flow

```text
https://gw-hs.recordsweb.org
        ↓
Cloudflare wildcard DNS
        ↓
recordsweb-community-router Worker
        ↓
https://recordsweb.vercel.app
        ↓
RecordsWeb detects GW.HS from window.location.hostname
        ↓
Bare hostname = organisation login
```

After authentication, staff pages use hash routes such as `/#/home`, `/#/patients`, `/#/management`, and `/#/policing`.

## Cloudflare

1. Keep the existing Cloudflare nameservers.
2. Create a proxied wildcard DNS record for `*.recordsweb.org` (the Worker route must receive the traffic).
3. Deploy `cloudflare/recordsweb-community-router.js` as the `recordsweb-community-router` Worker.
4. Add the Worker route `*.recordsweb.org/*` for the `recordsweb.org` zone.
5. Keep explicit service records such as `www.recordsweb.org`, `api.recordsweb.org`, `status.recordsweb.org`, and `cdn.recordsweb.org` as normal Cloudflare DNS records. The Worker proxies only hostnames matching `XX-XX.recordsweb.org` to Vercel and passes all other hostnames through to their existing DNS origin.

Vercel does not need `*.recordsweb.org` added as a project domain when this Worker architecture is used. The Worker fetches the existing `recordsweb.vercel.app` deployment.

## Supabase

No 5.3.1 database migration is required. RecordsWeb 5.3.0's organisation identifier migration remains required.

For Auth redirects, keep the RecordsWeb production URLs configured and allow organisation redirect URLs if your password recovery flow returns to organisation portals.

## Expected behaviour

- `recordsweb.org` — public RecordsWeb website.
- `gw-hs.recordsweb.org` — GW.HS sign-in screen directly, with no `/#/login` in the address bar.
- `gw-hs.recordsweb.org/#/home` — authenticated organisation home.
- `gw-hs.recordsweb.org/#/patients` — authenticated patient search/workspace.
- Unknown or inactive organisation codes are rejected by the RecordsWeb organisation verification layer.
