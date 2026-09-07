# RecordsWeb 3.1.9 — Multi-organisation deployment

RecordsWeb 3.1.9 can now be deployed to multiple approved organisations while keeping the existing clinical UI.

## Organisation extension

Every deployment has a four-letter extension in this format:

```text
@XX.XX
```

Examples:

```text
@GW.HC
@AB.CD
```

The database stores the code without the `@` (`GW.HC`, `AB.CD`). Staff usernames use the full suffix, for example `first.last@AB.CD`.

A code must contain exactly two letters, a full stop, then two letters. It is normalised to uppercase.

## Windows installation

A fresh NSIS installation displays a **RecordsWeb organisation** setup page and asks for the extension before installation completes.

The selection is written to:

```text
%APPDATA%\RecordsWeb\install-config.json
```

and also retained in the current user's RecordsWeb registry key so later installer upgrades can preserve the same organisation. If a valid-but-wrong extension is entered, the first-launch verification screen lets the operator correct it and synchronises the corrected value back to both locations.

Existing Grove Way installs upgrading from the old single-organisation build are automatically seeded as `GW.HC`, so an Electron auto-update does not stop for an interactive organisation prompt.

## macOS

The macOS DMG remains a normal drag-to-Applications package. On the first launch, RecordsWeb displays the same-styled organisation setup screen and stores the selected extension in the Electron user-data directory. Subsequent launches reuse it.

## Supabase upgrade

For an existing RecordsWeb Supabase project, run:

```text
supabase/recordsweb-3.1.9-multi-organisation.sql
```

Then redeploy:

```text
supabase/functions/recordsweb-admin/index.ts
```

For a brand-new database, `supabase/schema.sql` also contains the multi-organisation finalisation at the end.

The migration adds:

- `organisations.active`
- `organisations.system_mode` (`general_practice` or `hospital`)
- `organisations.default_location`
- strict `XX.XX` organisation-code validation
- a safe pre-login organisation-config RPC
- staff username namespace enforcement
- automatic organisation assignment when patients are created
- organisation-aware branding and clinical-document Storage RLS
- organisation-aware maintenance lookup
- an operator-only organisation provisioning helper

Existing Grove Way data remains linked to the existing Grove Way organisation UUID. Existing legacy Grove Way logo/PDF Storage paths remain accessible only to `GW.HC` staff.

## Approving a new organisation

Run the migration first, then provision an organisation from the Supabase SQL Editor:

```sql
select (public.recordsweb_provision_organisation(
  'AB.CD',
  'Example Health Organisation',
  'general_practice',
  'Main Site'
)).*;
```

Use `hospital` instead of `general_practice` when registering a hospital deployment. The current 3.1.9 client intentionally retains the existing RecordsWeb UI; `system_mode` is stored centrally so a dedicated hospital shell can be introduced without changing organisation identity or data ownership later.

A copy-and-edit onboarding example is included at:

```text
supabase/examples/provision-organisation.sql
```

After creating the organisation, create its first manager in **Supabase Authentication → Users**, then insert the matching `public.profiles` row using that organisation's UUID. After that, the organisation's Management page can create further accounts normally.

## Isolation model

The installer extension is not treated as an authorisation boundary by itself. Supabase remains authoritative:

1. Before login, RecordsWeb checks that the installed extension maps to an active organisation.
2. Authentication must use the installed `@XX.XX` suffix.
3. The signed-in profile must belong to the same organisation.
4. RLS scopes clinical and organisation records through `current_organisation_id()`; disabling an organisation makes that helper return no organisation, immediately closing the clinical-data RLS boundary for existing sessions.
5. Management account creation derives its organisation from the authenticated manager on the server.
6. Storage paths use the organisation UUID and patient UUID rather than a shared Grove Way folder.

This prevents changing an installation code from granting access to another organisation's records.

## Changing an installation's organisation

The normal product flow intentionally does not provide a staff-facing switch: one installed RecordsWeb deployment is bound to one approved organisation. To repurpose a device, uninstall/clear the deployment configuration and install it for the new organisation, or use an operator-controlled deployment procedure.

## Existing Grove Way deployment

The original deployment remains:

```text
Organisation: Grove Way Health Centre
Extension: @GW.HC
Mode: general_practice
Default location: Main Building
```

Its clinical UI and workflows remain unchanged.
