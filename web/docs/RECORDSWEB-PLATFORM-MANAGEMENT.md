# RecordsWeb platform management boundary

Platform-wide controls have been removed from community Management.

## Community Management retains
- Staff accounts
- Screen message logs
- Organisation audit log
- Deleted items
- Read-only system status

## Website operator management
Open `/#/platform-management` and sign in with the reserved `gus.farnsworth@XX.XX` identity whose suffix matches the account's active organisation.

The operator area contains platform maintenance, release control, and a link to access-request review.

## Supabase
Run `supabase/recordsweb-3.2.1-platform-management.sql`. This creates the global platform state and operator-only RPCs, and revokes community access to the legacy maintenance writer.
