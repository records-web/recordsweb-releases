# RecordsWeb 3.2.2 — Platform Community Management

Community administration is available only from the website Platform Management area and is protected by the reserved `gus.farnsworth@XX.XX` operator rule.

## Controls

The **Communities** tab can now:

- create a RecordsWeb community;
- edit the community name, RecordsWeb mode and default location;
- disable or re-enable a community;
- reset the reserved `gus.farnsworth@XX.XX` operator password;
- create a missing reserved operator account when the community is active;
- show whether each community is active and whether its reserved operator is ready.

The organisation extension is deliberately immutable after creation because it is the login namespace used by staff accounts and organisation-scoped data.

## Disabling a community

Disabling sets `organisations.active = false`. The supplied SQL migration also makes `current_organisation_id()`, `current_organisation_code()` and `current_user_is_management()` require an active organisation. This closes the RLS boundary for already-authenticated community sessions and prevents new logins until the organisation is re-enabled.

The platform operator cannot disable the same community that their current operator account belongs to. To disable that community, sign in to Platform Management with the reserved operator account from another active community first. This prevents accidental operator lockout.

## Backend deployment

Run:

`supabase/recordsweb-3.2.2-community-management.sql`

Then redeploy:

`supabase/functions/recordsweb-platform-admin/index.ts`

The Edge Function performs all community writes with the service role after independently verifying the caller as a RecordsWeb platform operator. The browser never receives the service-role key.

## No hard delete

Community deletion is intentionally not exposed. RecordsWeb clinical and audit data is organisation-scoped and may be referenced by many tables. Use **Disable** to suspend a community without destroying its records.
