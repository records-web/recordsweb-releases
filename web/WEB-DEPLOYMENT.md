# RecordsWeb Web 3.2.0

This project is the browser-hosted RecordsWeb application for Grove Way Health Centre. It retains the desktop-style RecordsWeb interface, clinical pages, Supabase integration, consultation template, appointments/check-in wait timer, documents, staff area, management tools, security controls and messaging.

## Local development

```bash
npm install
npm run dev
```

Vite will print the local URL.

## Production build

```bash
npm run build
```

Deploy the generated `dist/` directory to the web host.

## Supabase configuration

Create a `.env` file from `.env.example` and provide only the public browser client values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or another server-side secret in Vite/browser code.

## Web auto-updates

RecordsWeb Web 3.2.0 uses `public.app_releases` as its update gate.

By default:

```env
VITE_RECORDSWEB_RELEASE_CHANNEL=stable
VITE_RECORDSWEB_UPDATE_CHECK_SECONDS=60
VITE_RECORDSWEB_UPDATE_GRACE_SECONDS=120
```

The website checks Supabase immediately after loading, every 60 seconds while open, when the browser comes back online, and when the tab becomes visible again.

When a newer active `stable` release is found:

1. A **RecordsWeb needs an update** notice appears.
2. The staff member can select **Refresh now**.
3. Otherwise a 120-second countdown runs.
4. At zero, RecordsWeb performs a cache-busting browser navigation so the newly deployed website is loaded.
5. If unsaved consultation/form work is open, the automatic countdown pauses. The user can finish/save their work and the countdown resumes.
6. Selecting **Refresh now** while unsaved work is detected shows a warning before the refresh proceeds.

The supplied `vercel.json` prevents the root HTML from being held in a stale browser/CDN cache. Vite's hashed static assets can still be cached normally.

### Publishing a shared desktop + website release

The simplest setup is to use the same `stable` version for both desktop and website releases.

**Do not register the Supabase release until both deliverables are ready.**

Recommended order:

1. Merge/tag the RecordsWeb version in GitHub.
2. Allow the website deployment to complete successfully.
3. Publish the matching desktop GitHub Release and installer assets.
4. Insert/activate the matching version in Supabase `app_releases` on channel `stable`.
5. Existing desktop clients begin their installer update; existing web clients show the refresh update.

See `supabase/examples/publish-web-release.sql`.

If website and desktop versions need to move independently, set the website environment variable to:

```env
VITE_RECORDSWEB_RELEASE_CHANNEL=web
```

Then publish website-only versions with `channel = 'web'`. Desktop can remain on `stable`.

## One GitHub repository for desktop + website

Yes. GitHub Releases belong to the repository, not to a particular folder, so the same repository can contain both products.

A clean monorepo layout is:

```text
RecordsWeb/
├─ desktop/                 Electron/Vite desktop project
├─ web/                     this Vite website project
├─ .github/
│  └─ workflows/            optional desktop release + web deploy workflows
└─ README.md
```

Then:

- Create GitHub Releases such as `v3.2.0` at repository level.
- Put the Windows installer, `.blockmap` and `latest.yml` on that GitHub Release.
- Connect Vercel to the same GitHub repository and set **Root Directory** to `web`.
- Vercel deploys the website from the `web/` folder whenever the configured branch changes.
- Supabase remains the release/version gate used by RecordsWeb clients.

You do not need a second GitHub repository merely because one target is Electron and the other is a website.

## Existing database

Use the same Supabase schema and migrations as the desktop build. The web update system does not require a new database migration because the existing `app_releases.channel` field is reused.

The appointment wait timer still requires `supabase/recordsweb-3.1.8.sql` on databases that have not already run it.

## Routing

RecordsWeb Web uses `HashRouter`, so routes appear as `/#/patients/...`. This avoids requiring SPA rewrite rules on simple static hosts.

## Browser security note

Everything bundled by Vite is delivered to the browser and must be treated as public client code. Do not place service-role keys, GitHub access tokens, database passwords or other private server credentials in the web project.

## GitHub Pages option

The production build uses relative Vite asset paths, so it can also be served from a GitHub Pages project URL such as `https://OWNER.github.io/RecordsWeb/`. Because RecordsWeb uses `HashRouter`, browser routes stay after `#` and do not need Pages rewrite rules.

For a real deployment that handles sensitive or clinical-style information, treat GitHub Pages as static hosting only: repository visibility does not make browser-delivered secrets private. Keep all privileged operations behind Supabase RLS/Edge Functions or another server-side service.

## Social link preview

The website includes Open Graph and Twitter/X card metadata in `index.html`. Shared links use:

- Title: `RecordsWeb — Clinical Records System`
- Preview image: `https://recordsweb.vercel.app/recordsweb-update-logo.png`
- Site URL: `https://recordsweb.vercel.app/`

Discord, WhatsApp, Teams, X and other services that support Open Graph/Twitter cards can use this metadata when generating a link preview. Preview services may cache metadata, so an older preview can remain visible for a while after a deployment.
