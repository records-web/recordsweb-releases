# RecordsWeb 3.1.0 - Maintenance Mode

RecordsWeb 3.1.0 adds organisation-wide maintenance mode without changing the normal clinical workspace layout.

## Setup

Run `supabase/recordsweb-3.1.0.sql` in the Supabase SQL Editor.

No service-role key is added to the Electron application. Maintenance changes are performed by a SECURITY DEFINER RPC that verifies the signed-in account is active and has Management access.

## Behaviour

1. RecordsWeb performs the normal mandatory update check.
2. Before displaying login, it checks the public maintenance state for `GW.HC`.
3. When maintenance is enabled, the compact window remains the same size as login and displays the maintenance message instead of credentials.
4. The public screen polls for changes and has a Retry action.
5. A subtle Management access link allows an active Management account to sign in and enter the application so maintenance can be disabled.
6. Already-signed-in non-Management staff receive a 60-second save-work warning and are then signed out to the maintenance screen.
7. Maintenance enable/disable events are recorded in `audit_log` when that table is installed.

## Login fix

The previous `supabase.rpc(...).catch(...)` call has been removed. Supabase query builders are awaited normally and any optional login-marker error is handled without exposing a raw JavaScript exception on the login screen.
