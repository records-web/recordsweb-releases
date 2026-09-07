# RecordsWeb Web 3.2.0 — Multi-Organisation

## Browser organisation selection

The website uses the same four-letter organisation namespace as the desktop application:

```text
@XX.XX
```

Examples:

```text
@GW.HC
@AB.CD
```

On a browser with no selected organisation, RecordsWeb displays an organisation setup screen before the login page. The selected code is verified through the limited public Supabase RPC and stored in browser local storage. Organisation-specific local/demo storage keys are namespaced by that code.

On the login page, **Change organisation** allows a signed-out user to switch to another approved organisation. RecordsWeb verifies that the new organisation exists and is active before saving it, then reloads to guarantee that all services use the new namespace.

## Dedicated organisation deployment

A dedicated deployment can preselect a default organisation with:

```env
VITE_RECORDSWEB_ORG_CODE=GW.HC
```

Do not include the `@` in the environment variable.

If this variable is left blank, each browser selects its organisation on first use. A user can still use **Change organisation** later; a browser selection takes precedence over the default.

## Supabase requirement

Apply:

```text
supabase/recordsweb-3.2.0-multi-organisation.sql
```

Then redeploy:

```text
supabase/functions/recordsweb-admin/index.ts
```

The Edge Function derives/validates the organisation for privileged staff administration rather than trusting an arbitrary organisation ID from browser code.

## Provisioning organisations

Use the included example:

```text
supabase/examples/provision-organisation.sql
```

Example:

```sql
select (public.recordsweb_provision_organisation(
  'AB.CD',
  'Example Health Organisation',
  'general_practice',
  'Main Site'
)).*;
```

Hospital-mode metadata can be provisioned with:

```sql
select (public.recordsweb_provision_organisation(
  'AB.CD',
  'Example Hospital',
  'hospital',
  'Main Hospital'
)).*;
```

## Isolation

Organisation-owned clinical records remain protected by Supabase RLS using the authenticated staff profile's `organisation_id`. The browser-selected extension is used to choose the correct login namespace and public organisation configuration; it does not by itself grant access to another organisation's records.

Users must authenticate with a profile belonging to the selected organisation.
