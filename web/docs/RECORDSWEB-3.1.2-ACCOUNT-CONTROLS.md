# RecordsWeb 3.1.2 — Management account controls

- Management can force another staff member out of an active RecordsWeb session without disabling the account.
- Disabling an account requires a reason of up to 500 characters.
- The disable reason is shown to that staff member when they try to sign in.
- Disabling an account also ends any current RecordsWeb session.
- Re-enabling clears the disable reason.
- Both actions are written to the existing Management audit log.

## Deployment
1. Run `supabase/recordsweb-3.1.2.sql` in the Supabase SQL Editor.
2. Redeploy the `recordsweb-admin` Edge Function.
3. Package/publish RecordsWeb 3.1.2.

The service-role key remains server-side in the Edge Function only.
