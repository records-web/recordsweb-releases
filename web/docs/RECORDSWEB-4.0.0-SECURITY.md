> **Historical document:** This describes the 4.0.0 deployment. For RecordsWeb 4.1.0, use `RECORDSWEB-4.1.0-DEPLOYMENT.md`; the Discord bot token now belongs only on the external 24/7 bot host.

# RecordsWeb 4.0.0 — Security & Trust

RecordsWeb 4.0.0 bundles the 3.9.14 application with the security hardening programme as a full major release.

Included: session registry/revocation, login rate limiting, account/IP/device restrictions, immutable security events, patient access auditing, restricted-record break-glass access, 6-digit security PIN step-up, Discord verification flow, Shared Care expiry/scope schema, Platform Security & Moderation, and Electron machine-identity hashing.

Public pages and Platform Management remain outside the clinical maintenance gate.

Deployment: run `supabase/recordsweb-4.0.0-security-hardening.sql`, deploy `recordsweb-security`, set `RECORDSWEB_SECURITY_PEPPER`, and ensure `RECORDSWEB_DISCORD_BOT_TOKEN` remains configured for Discord verification.
