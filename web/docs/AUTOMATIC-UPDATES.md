# RecordsWeb automatic updates — GitHub Releases

RecordsWeb 2.4 uses **Supabase for the mandatory version check** and **GitHub Releases for the application binaries**.

This avoids the Supabase Free Storage object-size limit while keeping the login-blocking version policy controlled from the RecordsWeb database.

## Architecture

```text
RecordsWeb starts
      |
      v
Supabase public.app_releases
(required stable version)
      |
      +-- installed version current --> login
      |
      +-- newer version required
              |
              v
       GitHub Releases
       latest.yml + EXE + blockmap
              |
              v
       Electron Updater downloads
              |
              v
       quitAndInstall() + restart
              |
              v
             login
```

## .env configuration

Copy `.env.example` to `.env` and set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY

VITE_GITHUB_UPDATE_OWNER=YOUR_GITHUB_USERNAME_OR_ORGANISATION
VITE_GITHUB_UPDATE_REPO=recordsweb-releases
VITE_GITHUB_UPDATE_CHANNEL=latest
```

The GitHub update repository should be **public**. Do not put a GitHub personal access token in the app `.env`: Vite variables are compiled into the desktop application and are not secrets.

The `.env` values are used in two places:

1. Vite embeds the public GitHub owner/repository in the packaged RecordsWeb renderer so it knows which public release feed to use.
2. `scripts/run-electron-builder.cjs` loads `.env` before Electron Builder runs so the generated updater metadata is tied to the same GitHub repository.

## Creating the GitHub repository

Create a repository such as:

```text
YOUR_ACCOUNT/recordsweb-releases
```

It may contain no source code. It only needs to be public and capable of hosting Releases.

## Building version 2.5.0

The project version is stored in `package.json`.

Run:

```powershell
npm install
npm run package:win
```

The build wrapper reads `.env` automatically. In `release/`, the important files are:

```text
latest.yml
RecordsWeb-Setup-2.5.0.exe
RecordsWeb-Setup-2.5.0.exe.blockmap
```

Do not upload `win-unpacked`, `builder-debug.yml`, or `builder-effective-config.yaml` to the GitHub Release.

## Publishing manually on GitHub

1. Open the update repository on GitHub.
2. Open **Releases**.
3. Choose **Draft a new release**.
4. Create the tag `v2.5.0`.
5. Set the release title to `RecordsWeb 2.5.0`.
6. Upload these three files from `release/`:
   - `latest.yml`
   - `RecordsWeb-Setup-2.5.0.exe`
   - `RecordsWeb-Setup-2.5.0.exe.blockmap`
7. Publish it as a normal release, not a draft. For the stable channel, do not mark it as a prerelease.
8. Make sure it is the latest release.

The three files must come from the **same build**. Do not reuse an older `latest.yml` with a newer EXE because the checksums will not match.

## Activating the mandatory version in Supabase

Only after the GitHub Release is fully published, run `supabase/examples/publish-release.sql`, or insert/update the stable row manually:

```sql
insert into public.app_releases (
  version,
  channel,
  release_notes,
  active,
  published_at
)
values (
  '2.5.0',
  'stable',
  'RecordsWeb 2.5.0',
  true,
  now()
)
on conflict (channel, version) do update set
  release_notes = excluded.release_notes,
  active = excluded.active,
  published_at = excluded.published_at;
```

Supabase does not need the GitHub URL. The application gets the GitHub owner/repository from its bundled `.env` configuration.

## Real update test: 2.3.0 -> 2.5.0

1. Install the packaged RecordsWeb 2.3.0 build on a Windows test machine.
2. Configure this 2.5.0 source project's `.env` with the public GitHub update repository.
3. Build 2.5.0 with `npm run package:win`.
4. Publish the three updater files in GitHub Release `v2.5.0`.
5. Add/activate `2.5.0` in Supabase `app_releases`.
6. Open the **installed 2.3.0** RecordsWeb application.
7. It should block login, download 2.5.0 from GitHub, show real progress, install, restart, and return to login.

Real self-update is intentionally disabled for unpackaged Electron processes.

## Development update-screen test

To test the complete update UI without installing another EXE:

```powershell
npm run test:update
```

This starts development RecordsWeb in a simulator mode. It exercises checking, downloading progress, installation state, and then returns to login. It does **not** replace files on the computer and does not contact GitHub for a binary.

Use the packaged 2.3 -> 2.4 procedure above to test the real GitHub download and installation path.

## Optional automatic GitHub publishing later

Electron Builder can publish directly to GitHub when run with `--publish always`, but this requires a GitHub token with release permissions. Keep that token in a CI secret or temporary shell environment variable such as `GITHUB_RELEASE_TOKEN`; never put it into the Vite `.env` bundled with RecordsWeb.

## Production recommendation

Code-sign the Windows installer/application before distributing RecordsWeb beyond development. The updater verifies update metadata/checksums, but Windows code signing provides publisher identity and avoids unsigned-application warnings.
