# RecordsWeb 4.0.0 — Deployment

RecordsWeb 4.0.0 is the major Security & Trust release based on the 3.9.14 website and Electron source bases.

## Before deploying the applications

1. Run `supabase/recordsweb-4.0.0-security-hardening.sql` in the Supabase SQL editor.
2. Deploy the security function:

   `supabase functions deploy recordsweb-security --no-verify-jwt --project-ref cdakocrmfstsknbgugkc`

3. Set a long random security pepper:

   `supabase secrets set RECORDSWEB_SECURITY_PEPPER="YOUR-LONG-RANDOM-SECRET" --project-ref cdakocrmfstsknbgugkc`

4. Keep `RECORDSWEB_DISCORD_BOT_TOKEN` configured for Discord-link verification.
5. If the updated Discord function is deployed, redeploy `recordsweb-discord` so its release metadata reports 4.0.0.

## Website

Run `npm install` and `npm run build`, then deploy using the existing RecordsWeb website/Vercel workflow.

## Electron

Run `npm install` followed by `npm run package:win` (or the appropriate platform packaging command).

The Electron device restriction implementation uses the OS machine identity where available (Windows MachineGuid, Linux machine-id, macOS IOPlatformUUID), immediately hashes it using SHA-256, and never exposes the raw identifier to the renderer or backend.

## Security features bundled

- login preflight, failed-login auditing and progressive rate limiting
- account, IP/CIDR, and device/hardware restrictions
- active security session registry, heartbeat and revocation
- 6-digit Security PIN and step-up checks for prescribing and Shared Care administration
- patient record access logging
- restricted/highly restricted record classifications
- audited 30-minute break-glass access
- Discord patient-link verification challenge
- permission model and multi-role permission helper
- Platform Management Security & Moderation tab
- audited platform support sessions
- Shared Care scope/expiry schema
- append-only security event stream
- public pages and Platform Management remain available during maintenance

## Build note

The supplied ZIPs are complete source bundles. Pre-existing 3.9.14 `dist` output has intentionally been excluded so an old renderer build cannot be mistaken for RecordsWeb 4.0.0. Build the bundles with the commands above before release.
