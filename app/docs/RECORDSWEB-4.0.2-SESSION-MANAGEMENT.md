# RecordsWeb 4.0.2 — Platform Session Management

This hotfix extends RecordsWeb 4.0 with platform-wide session visibility and fixes Platform Management being visually reset when Supabase refreshes the operator token after changing browser/window tabs.

## New Platform Management → User sessions

RecordsWeb platform operators can now view registered sessions across every RecordsWeb community.

Each row shows:

- staff display name and login name
- community name and code
- Website or Electron app
- device name / operating system
- RecordsWeb app version
- IP address
- SHA-256 device hash
- session start and last-seen times
- active / revoked / ended / expired state

Operators can copy a device hash, revoke an active session, or send a device/IP directly into Security & Moderation to create a restriction.

RecordsWeb does **not** expose Supabase access tokens, refresh tokens, passwords, raw Windows MachineGuid values, serial numbers, or other authentication secrets in Platform Management.

## Device hashes

### Electron

Electron hashes a stable machine identifier locally with SHA-256. The raw machine identifier never enters React or Supabase.

### Website

The website uses a random installation identifier stored in browser storage and hashes it with SHA-256. Clearing site data creates a new browser installation identifier, so website device bans are less durable than Electron hardware bans.

To obtain a user's device hash, open:

`Platform Management → User sessions`

Then select the session and use **Copy hash** or **Ban device**.

## Platform Management tab-refresh fix

Supabase may emit `TOKEN_REFRESHED` when a hidden browser/Electron window becomes active. RecordsWeb 4.0.1 temporarily cleared platform authorisation while re-verifying that event, which could make the page appear to refresh and return to another panel.

4.0.2 now:

- keeps already-verified operator authorisation during token refreshes
- verifies only when the signed-in operator actually changes
- preserves the selected Platform Management panel in session storage
- does not reload session data just because the browser/window changes focus

## Database migration

Run:

`supabase/recordsweb-4.0.2-session-management.sql`

This adds `client_type` to `recordsweb_security_sessions` and backfills older sessions as `website` or `electron` using their user agent.

## Edge Function

Redeploy after the SQL migration:

```powershell
supabase functions deploy recordsweb-security --no-verify-jwt --project-ref cdakocrmfstsknbgugkc
```

The Edge Function adds:

- `platform-list-sessions`
- `platform-revoke-session`
- Website/Electron session registration metadata
- profile/community enrichment for Platform Management

