# RecordsWeb 3.2.3 — Roblox Integration

RecordsWeb 3.2.3 adds a per-community server-to-server Roblox bridge. Each RecordsWeb organisation can create its own revocable connection code from **Management → Roblox integration**.

## What happens

When an appointment changes to **S — Patient in consulting room**, Supabase creates a short-lived `patient_called` event for that appointment's organisation. Authorised Roblox servers poll the RecordsWeb game API and display that call on waiting-room screens.

By default the display uses `First name + surname initial`. Management can choose full name or record number instead.

## Supabase

Run:

```sql
supabase/recordsweb-3.2.3-roblox-integration.sql
```

Then deploy both Edge Functions:

```bash
supabase functions deploy recordsweb-roblox-admin
supabase functions deploy recordsweb-game-api --no-verify-jwt
```

`recordsweb-roblox-admin` remains protected by normal Supabase authentication and Management permissions. `recordsweb-game-api` deliberately disables JWT verification because Roblox cannot sign in as a RecordsWeb staff user; it authenticates exclusively using the per-community `rw_live_...` connection code.

## Community setup

1. Sign into the community using a Management account.
2. Open **Management → Roblox integration**.
3. Generate a connection code.
4. Set the Roblox Universe ID (`game.GameId`).
5. Optionally add one or more allowed Place IDs (`game.PlaceId`).
6. Choose the patient display style and display duration.
7. Enable the integration and save.
8. Copy the game API endpoint and connection code into the server-side Roblox configuration.

Connection codes are only shown in full at generation time. RecordsWeb stores a SHA-256 hash plus the final four characters for identification. Regenerating or revoking the code invalidates the old game connection immediately.

## Roblox package

Use the separate `RecordsWeb-Roblox-Bridge-v3.2.3.zip`. It contains an importable waiting-room model, the server bridge, configuration source, and a Studio builder script for additional display screens.

Enable **Game Settings → Security → Allow HTTP Requests** before testing.

## Security boundary

Roblox never receives the Supabase service-role key, user credentials, consultation records, medication, documents, or unrestricted patient records. The game API returns only short-lived call-display data for the organisation associated with the supplied connection code.
