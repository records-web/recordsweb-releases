# RecordsWeb 4.0.0 Security Feature Matrix

| Feature | Included | Enforcement point |
|---|---|---|
| Immutable security audit stream | Yes | PostgreSQL / service-role writes |
| Patient access log | Yes | Edge Function |
| Restricted records | Yes | Patient classification + UI gate |
| Break-glass access | Yes | Edge Function + critical audit event |
| Active session registry | Yes | Edge Function |
| Session revocation | Yes | Edge Function / client heartbeat |
| Automatic revoke on account/role/password security change | Yes | PostgreSQL trigger |
| Login rate limiting | Yes | Edge Function preflight |
| Account bans | Yes | Edge Function |
| IP bans | Yes | Edge Function |
| Device/hardware bans | Yes | Electron machine hash / browser install hash |
| Temporary bans | Yes | `expires_at` |
| Organisation-only bans | Yes | scoped ban row |
| Platform-wide bans | Yes | scoped ban row |
| Platform moderation history | Yes | immutable event stream |
| Support-access sessions | Yes | explicit reason/reference/expiry |
| Security PIN | Yes | SHA-256 + server-side pepper |
| Step-up authentication tokens | Yes | 10-minute token rows |
| Permission keys | Yes | PostgreSQL permission tables |
| Multi-role permission resolution | Yes | `recordsweb_has_permission()` |
| Discord ID challenge | Yes | Bot DM + six-digit challenge |
| Shared Care scopes | Yes | SQL columns |
| Shared Care expiry | Yes | SQL columns |
| Raw hardware serial storage | No | intentionally avoided |
| Browser fingerprinting | No | intentionally avoided |
