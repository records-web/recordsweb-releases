# RecordsWeb Web 3.2.0

This project is the browser-hosted RecordsWeb clinical records platform. It retains the existing RecordsWeb desktop-style UI while adding multi-organisation deployment through approved `@XX.XX` extensions.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Deploy the generated `dist/` directory.

## Supabase configuration

Create a `.env` file from `.env.example`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
VITE_RECORDSWEB_RELEASE_CHANNEL=stable
VITE_RECORDSWEB_UPDATE_CHECK_SECONDS=60
VITE_RECORDSWEB_UPDATE_GRACE_SECONDS=120
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or another private server credential in a Vite/browser environment variable.

## Multi-organisation database update

Before using the multi-organisation web build against an existing RecordsWeb database, run:

```text
supabase/recordsweb-3.2.0-multi-organisation.sql
```

Then redeploy the updated admin Edge Function:

```text
supabase/functions/recordsweb-admin/index.ts
```

The SQL migration adds/updates:

- `organisations.active`
- `organisations.system_mode`
- `organisations.default_location`
- strict `XX.XX` organisation code validation
- limited public organisation discovery for the pre-login screen
- organisation provisioning helpers
- organisation-aware clinical/RLS behaviour
- organisation-aware Storage policies

The admin Edge Function is also organisation-aware and validates privileged account actions against the authenticated management user's organisation.

## Organisation selection on the website

If no default organisation is configured, a first-time browser is asked for an extension such as:

```text
@GW.HC
```

RecordsWeb verifies that the extension exists and is active in Supabase before continuing. The selection is saved in that browser.

The signed-out login page also contains **Change organisation**, allowing a user to switch to another approved organisation without changing the website deployment.

To give a dedicated website deployment a default organisation, set:

```env
VITE_RECORDSWEB_ORG_CODE=GW.HC
```

Do not include `@` in this environment variable.

If `VITE_RECORDSWEB_ORG_CODE` is blank, the site operates as a multi-organisation entry point and asks each new browser for its extension.

## Provisioning another organisation

Use:

```text
supabase/examples/provision-organisation.sql
```

Example GP deployment:

```sql
select (public.recordsweb_provision_organisation(
  'AB.CD',
  'Example Health Organisation',
  'general_practice',
  'Main Site'
)).*;
```

Example hospital deployment metadata:

```sql
select (public.recordsweb_provision_organisation(
  'AB.CD',
  'Example Hospital',
  'hospital',
  'Main Hospital'
)).*;
```

The current 3.2.0 website retains the existing RecordsWeb clinical UI. `system_mode` is stored and exposed so GP/Hospital-specific UI shells can be introduced without changing the organisation/data model again.

## Data boundary

Selecting an extension does **not** grant access to that organisation. It selects the expected login namespace and public branding/configuration.

Authenticated access is still enforced by Supabase authentication and RLS using the staff profile's `organisation_id`. A user whose profile belongs to another organisation is rejected after authentication.

Organisation-aware browser/demo caches are separately namespaced to prevent one selected organisation reusing another organisation's local demo/login/audit/session data.

## Web auto-updates

RecordsWeb Web uses `public.app_releases` as its update gate.

Default configuration:

```env
VITE_RECORDSWEB_RELEASE_CHANNEL=stable
VITE_RECORDSWEB_UPDATE_CHECK_SECONDS=60
VITE_RECORDSWEB_UPDATE_GRACE_SECONDS=120
```

The site checks Supabase immediately, every 60 seconds while open, when connectivity returns, and when the tab becomes visible again.

When a newer active release exists:

1. **RecordsWeb needs an update** appears.
2. Staff can choose **Refresh now**.
3. Otherwise a countdown runs.
4. Unsaved consultation/form work pauses automatic refresh.
5. Once safe, RecordsWeb refreshes with a cache-busting URL and loads the deployed version.

The supplied `vercel.json` prevents stale root HTML caching.

## Shared desktop + website release process

The website and Electron application can remain in one GitHub repository:

```text
recordsweb-releases/
├─ app/
├─ web/
├─ .github/workflows/
└─ GitHub Releases
```

For a shared version such as `v3.2.0`:

1. Push/deploy `web/` version 3.2.0.
2. Build the Windows Electron installer.
3. Run the macOS GitHub Action.
4. Confirm the GitHub Release contains both Windows and macOS assets.
5. Publish/activate `3.2.0` in Supabase `app_releases` last.

That prevents desktop or web clients being prompted before the matching deliverables are actually available.

## Vercel

Connect Vercel to the same repository and set:

```text
Root Directory: web
Framework: Vite
Build Command: npm run build
Output Directory: dist
```

Add the public Vite/Supabase environment variables in Vercel Project Settings.

## Routing

RecordsWeb Web uses `HashRouter`, so routes appear as:

```text
/#/patients/...
```

This avoids requiring SPA rewrite rules on simple static hosts.

## Social link preview

`index.html` contains Open Graph/Twitter metadata using:

```text
https://recordsweb.vercel.app/recordsweb-update-logo.png
```

The preview description now describes RecordsWeb as a multi-organisation clinical records platform rather than a Grove Way-only deployment.

## Desktop software downloads

The website footer detects the visitor's desktop OS and queries the GitHub **Latest** Release directly:

- Windows → `RecordsWeb-Setup-*.exe`
- macOS → latest RecordsWeb `.dmg`
- mobile/unknown → explicit Windows/macOS choices

The browser starts the matching release asset download directly; it does not redirect users to the GitHub Releases page.

Keep `https://api.github.com` in the Content Security Policy `connect-src` list.


## RecordsWeb 3.2.1 public access requests

After the existing multi-organisation migration, run `supabase/recordsweb-3.2.1-public-access-requests.sql`. This creates the private request table, submission RPC and private 4 MB logo bucket. The website root is public; organisation selection is only requested when entering the staff sign-in area.

## Restricted request review page

RecordsWeb includes a restricted review page at `/#/review-request`.

Run `supabase/recordsweb-3.2.1-review-request.sql` after the public access-request migration. The database functions and private logo policy permit reserved `gus.farnsworth@XX.XX` RecordsWeb accounts, provided the `XX.XX` suffix matches the active organisation assigned to that authenticated profile.

That Supabase Auth user must already exist and have a password. The reviewer page uses its own restricted sign-in and does not require an organisation extension.


## Fixed RecordsWeb branding

RecordsWeb uses one product-owned visual identity across every organisation. Organisation staff cannot replace the RecordsWeb logo or alter the product colour palette. Organisation names, extensions, modes and locations remain deployment-specific. Run `supabase/recordsweb-3.2.1-branding-lock.sql` once on existing Supabase deployments.


## RecordsWeb 3.2.2 platform community creation

After running `supabase/recordsweb-3.2.2-community-creation.sql`, deploy the operator-only Edge Function:

```bash
supabase functions deploy recordsweb-platform-admin
```

Community creation is exposed only in the website Platform Management area. The service-role key is used only inside the Supabase Edge Function and must not be configured in Vercel.

## Platform community management (3.2.2)

After the community-creation migration, also run:

`supabase/recordsweb-3.2.2-community-management.sql`

Then redeploy the protected platform administration function:

`supabase functions deploy recordsweb-platform-admin`

This enables website-only community editing, enable/disable controls, and reserved operator password/create controls. No service-role key belongs in Vercel; it stays in the Supabase Edge Function environment.
