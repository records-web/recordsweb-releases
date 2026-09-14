# RecordsWeb 3.9.14

- `/api/status` reads `recordsweb_public_platform_state()` alongside automated health checks.
- When platform maintenance is enabled, the public status page shows **Scheduled Maintenance in Progress** and the configured maintenance message/estimated completion time.
- Individual service health checks continue to display underneath maintenance status.
- Public routes remain outside the maintenance gate.
- `/platform-management` remains outside the maintenance gate so authorised platform operators can end or update maintenance.
- Clinical/community staff login and staff routes remain protected by the maintenance gate.
