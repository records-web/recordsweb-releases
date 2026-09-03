# RecordsWeb 2.4

RecordsWeb is an Electron + React desktop clinical-record prototype for **Grove Way Health Centre**.

## Demo sign-in

- Username: `manager.grove@GW.HC`
- Password: `demo`

The demo database starts empty. There are no sample patients, consultations, medications, appointments, staff reports, jobs or notices.

## Run locally

```powershell
npm install
.\START-RECORDSWEB.bat
```

Or:

```powershell
npm run dev
```

## Build Windows installer

```powershell
.\BUILD-WINDOWS.bat
```

or:

```powershell
npm run package:win
```

## RecordsWeb 1.7 Staff Area changes

- Removed the Workflow Manager workspace and all Workflow navigation.
- Removed Population Reporting.
- Replaced Reporting with a **Staff Area**.
- Staff Area includes:
  - Internal staff reports.
  - Jobs and vacancies.
  - Staff notices.
- All staff can submit internal reports.
- Management users can update report status, create/edit vacancies and create/edit staff notices.
- The appointment count remains available in the worklist strip.

## Management and branding

Management users can:

- Create staff accounts using the `first.last@GW.HC` login format.
- Assign a staff title such as Mr, Mrs, Miss, Ms, Dr or Prof.
- Assign multiple roles to the same staff account and choose a primary role.
- Edit existing staff names, titles, roles and Management access.
- Enable/disable accounts and reset passwords.
- Change the organisation-wide primary interface colour.
- Change the ribbon/navigation colour.
- Change the active-patient banner colour.
- Upload, replace or remove a Grove Way Health Centre logo.

A logo is rendered only when a logo file has actually been uploaded. There is no placeholder image.

### Supabase migration

For a new Supabase project, run the complete updated `supabase/schema.sql`.

For an existing RecordsWeb project, run the updated schema again. It adds:

- `staff_reports`
- `staff_jobs`
- `staff_notices`
- `organisation_notepad`
- `organisation_news`
- Staff Area and home-page Row Level Security policies and organisation-scoping triggers.

RecordsWeb 1.9 no longer reads from or writes to `workflow_tasks`. If an older Supabase database already contains that table, it can be left in place or removed manually after confirming it is no longer needed.

Redeploy the supplied `recordsweb-admin` Edge Function after updating if you are also upgrading from a version before the expanded management system.

For production use, configure `.env` from `.env.example`. Never place a Supabase service-role key in the Electron renderer.

## Clinical safety

This project is a prototype. Do not use it with real patient data until the required clinical-safety, security, data-protection, access-control, audit, backup and information-governance work has been completed.


## RecordsWeb 1.8 home-page collaboration

- Organisation Notepad is now backed by Supabase/demo storage. Every signed-in staff member can add notes. Staff can edit/delete their own notes and management can maintain all notes.
- Latest News is now backed by Supabase/demo storage. All staff can read active news; only management accounts can add, edit, deactivate or delete news items.
- Both areas begin empty in demo mode; no placeholder news or notepad records are seeded.
- Existing Supabase projects should re-run `supabase/schema.sql` to create the two new tables and RLS policies.


## RecordsWeb 1.9 input/focus reliability

- All RecordsWeb modal windows are now rendered through a shared React portal at the document root.
- Modal focus is explicitly initialised and trapped while the dialog is open.
- Clicking directly on a form control explicitly recovers renderer focus if Electron/Chromium has lost it.
- Interactive controls are explicitly marked as non-draggable Electron regions.
- Electron now restores focus to the renderer when the application window is focused or restored.
- Escape closes the active RecordsWeb modal and focus returns to the control that opened it.


## RecordsWeb 2.0 changes

- Staff roles are restricted to: GP Partner, Practice Manager, Assistant Manager, General Practitioner, GP Registrar (GPST2-3), GP Registrar (GPST1), Medical Student, Lead Nurse, Advanced Clinical Practitioner, General Practice Nurse, Nurse Associate, Healthcare Assistant, and Patient Coordinator. Staff may hold multiple roles and one is marked as the primary role.
- New patient registration automatically creates a persistent NHS-style identifier. It is stored on the patient record and is reused whenever that patient returns. This prototype-generated identifier is not an authoritative NHS/PDS assignment.
- Consultations form the patient's previous-visit history. Every active RecordsWeb staff member in Grove Way Health Centre can read consultations recorded by other clinicians in the same organisation.
- Medication is grouped into Acute Meds, Repeat, and Long Term Meds.
- Authentication is memory-only. RecordsWeb never restores a previous signed-in session when the app is launched (or the renderer is reloaded); users must sign in again. Supabase Auth session persistence is disabled.

## RecordsWeb 2.2 branding and realtime changes

Organisation branding logos are no longer stored as Base64 image data in the `organisations` table when Supabase mode is enabled.

The updated `supabase/schema.sql` creates a public Supabase Storage bucket named:

```text
recordsweb-branding
```

Management users can upload, replace and remove the Grove Way Health Centre logo from **Management → Appearance**. Storage write/delete policies require a management account. The database stores only the Storage object path, filename and update timestamp. The public bucket is intentional so the organisation logo can also appear on the RecordsWeb sign-in screen before authentication.

The logo image is rendered with no CSS border, outline, background plate or padding. If no logo exists, no image element is rendered.

The **Windows/Electron application icon is separate from organisation branding**. It should remain bundled with the desktop build (for example as `build/icon.ico`) rather than being loaded from Supabase.

For an existing Supabase project, re-run `supabase/schema.sql` before using the new logo uploader. This adds `logo_path` / `logo_updated_at`, creates `recordsweb-branding`, and installs the Storage policies.

### Live patient-record refresh warning

When Supabase mode is enabled, RecordsWeb now uses Supabase Realtime to detect
patient-record changes made by another signed-in Grove Way staff member while a
patient is open. A yellow warning appears above the record using the staff
member's RecordsWeb username and primary role:

```text
⚠️ (USERNAME - ROLE) has updated this patient's record, some information may be incorrect.
To obtain the latest information click HERE to refresh this page.
```

`HERE` refreshes only the routed patient page and re-runs its data loaders. It
does **not** reload the Electron renderer, so the current staff session remains
signed in.

The schema creates `patient_record_events`, audit triggers for patients,
problems, medication, consultations, diary items, documents, investigations and
referrals, an organisation-scoped RLS policy, and adds the event table to the
`supabase_realtime` publication. Events created by the currently signed-in user
are ignored by that user's own client, so staff are warned about changes made by
someone else.

For an existing Supabase deployment, re-run `supabase/schema.sql` before testing
this feature.

### Desktop application icon

The Electron/Windows application icon remains separate from the organisation
logo. Put the bundled Windows icon at:

```text
build/icon.ico
```

The development Electron window uses it automatically when the file exists, and
`build/**/*` is included in packaged builds. The Grove Way logo uploaded through
Management is still stored in Supabase Storage and is never used as the Windows
application executable icon.

### Application-version updates

The patient-record warning above handles **live clinical data changes**. Application binaries are updated separately using Electron Updater.

## RecordsWeb 2.4 GitHub forced desktop updates

RecordsWeb performs a mandatory version check before the login page is available. Supabase holds the latest approved version in `app_releases`. When the installed version is behind, the login page remains blocked and Electron Updater downloads the matching public **GitHub Release**.

Configure the update repository in the app `.env`:

```env
VITE_GITHUB_UPDATE_OWNER=YOUR_GITHUB_USERNAME_OR_ORGANISATION
VITE_GITHUB_UPDATE_REPO=recordsweb-releases
VITE_GITHUB_UPDATE_CHANNEL=latest
```

Do **not** put a GitHub token in the Vite `.env`. These values are bundled into the desktop application, so the release repository should be public.

`npm run package:win` reads the same `.env` through `scripts/run-electron-builder.cjs` and creates `latest.yml`, the NSIS installer and blockmap for that GitHub repository. Upload those three files to a normal published GitHub Release whose tag matches the version, e.g. `v2.5.0`.

The real progress bar is connected to Electron Updater's `download-progress` event. At 100%, RecordsWeb installs the update, restarts and requires staff to sign in again.

For UI testing without building/installing another version, run:

```powershell
npm run test:update
```

That simulates the update sequence only; the packaged 2.3 -> 2.4 flow is required to test a real GitHub download and binary replacement.

See `docs/AUTOMATIC-UPDATES.md` for the complete workflow. The old `recordsweb-updates` Supabase Storage bucket is no longer required for application binaries. Existing buckets are not deleted by the schema.

The supplied `build/icon.ico` remains bundled into the Windows executable/installer and is separate from the Grove Way organisation logo stored in Supabase.

## Windows build lock protection

`npm run package:win` now automatically closes a running packaged `RecordsWeb.exe` and removes the previous `release/win-unpacked` directory before Electron Builder starts. This prevents Windows from locking `resources/app.asar` from an earlier test build.

If another process still locks the release directory, close RecordsWeb and run:

```powershell
npm run clean:release
npm run package:win
```

The build wrapper also launches the Windows `electron-builder.cmd` shim through the Windows command shell, which avoids the `spawnSync ... EINVAL` error on newer Node versions.

## Staff screen messages and appointment state letters

RecordsWeb now includes staff-to-staff Screen Messages. The envelope button in the top-right header opens the inbox/composer. Staff can find colleagues by name, see Supabase Realtime presence, include offline staff, send to multiple recipients and flag a message as urgent. Urgent messages generate the blocking "You have an urgent screen message" prompt; View marks the message as read and opens it.

Re-run `supabase/schema.sql` to create `staff_screen_messages`, its RLS policies and realtime publication entry. The schema also allows active staff to read the Grove Way staff directory (names/roles only through the app query) so recipients can be selected.

The Appointment Book uses the agreed staff-facing state codes:

- `A` — patient is in reception.
- `S` — patient has been sent in and is in the consulting room with the clinician.
- `L` — consultation concluded and the patient has left.
- `W` — patient walked out before being seen.

Right-click an appointment for the quick status menu, or change the state from the appointment editor.

The bottom status bar uses the supplied NHS logo and now shows the signed-in staff member as `ROLE LAST NAME, FIRST NAME (Title)`, followed by `Organisation: Grove Way Health Centre` and `Location: Main Building`.

## Windows build output / locked app.asar

`npm run package:win` now creates a brand-new timestamped output directory for every build, for example:

```text
release/RecordsWeb-2.5.0-20260831-223500/
```

This deliberately avoids reusing `release/win-unpacked`. If an older unpacked RecordsWeb instance is still running and Windows has its `resources/app.asar` locked, the new build can still complete because Electron Builder writes to a different directory.

After a successful build, upload these three files from the newest timestamped folder to the matching GitHub Release:

```text
latest.yml
RecordsWeb-Setup-2.5.0.exe
RecordsWeb-Setup-2.5.0.exe.blockmap
```

Old timestamped build folders can be removed later after any running copy of RecordsWeb from that folder has been closed.


## Silent automatic installation

Production NSIS builds use a one-click, per-user installer. RecordsWeb calls `autoUpdater.quitAndInstall(true, true)` after the update is downloaded so routine updates install silently and the application restarts automatically. Windows security/UAC prompts cannot be suppressed if Windows itself requires elevation.


## Supabase staff account administration

Staff account creation and password resets are performed by the server-side `recordsweb-admin` Edge Function. The Electron application **must not** contain a Supabase service-role key.

After setting up Supabase or after changing the function, deploy it with:

```powershell
supabase functions deploy recordsweb-admin
```

See `docs/SUPABASE-ADMIN-SETUP.md` for the full setup and troubleshooting steps.

## Compact sign-in window

RecordsWeb now switches the Electron window between two modes. Before authentication the desktop window is a fixed compact sign-in window sized to the credentials panel, with no RecordsWeb clinical navigation rendered around it. After successful sign-in it expands to the full clinical workspace. Signing out returns the same window to compact sign-in mode.


## Compact update window

When RecordsWeb is checking for or installing a mandatory application update, Electron switches to a compact, fixed-size update window. The updater fills that window with no clinical navigation or unused full-page workspace. When the update check passes, RecordsWeb transitions to the compact login window; after sign-in it expands to the full clinical workspace.

## RecordsWeb 2.5.4 additions

- Urgent Screen Messages flash the Windows taskbar icon rather than forcing RecordsWeb above other applications.
- Screen Messages include a Reply action that targets the original sender.
- The signed-in clinician is locked on new consultations and cannot be manually changed.
- Appointment booking uses a searchable staff dropdown, the approved appointment-type list, and a receptionist-entered reason field.
- While staff are signed in, RecordsWeb checks for a newly required release and shows a bottom-right **An update is required** notice with **Start update**.
- Consultation items are visually separated into EMIS-style horizontal bands.
- Footer identity is formatted as `Role | SURNAME, First name (Title)`.

**Supabase note:** rerun `supabase/schema.sql` (or apply the updated `profile_read` policy) so all active Grove Way staff can read the active staff directory used by Screen Messages and the clinician picker.


## RecordsWeb 2.5.7 additions

- Appointment Book now shows **NHS No** between Patient and Type.
- The appointment context menu separates **View Medical Record** from **Edit appointment**. View Medical Record opens the selected patient's RecordsWeb medical record.
- Management now includes **Screen message logs**, a read-only audit view of staff-to-staff messages with sender, recipient, subject, full message body, priority, sent time and read status.
- Run `supabase/recordsweb-2.5.7.sql` on an existing Supabase project to allow management users to read the organisation-wide message audit trail.


## RecordsWeb 2.6.4

- Images and logos are non-draggable and no longer expose an image context menu, so application artwork behaves like embedded desktop UI.
- Dropping files onto the RecordsWeb window no longer navigates the Electron renderer away from the application. Normal file-picker uploads are unchanged.
- Packaged builds block accidental browser refresh and DevTools shortcuts, reducing the risk of losing unsaved form work or exposing browser tooling.
- Electron web security is explicitly enabled and embedded webviews are rejected. No visible UI changes are introduced by this release.


## RecordsWeb 2.7.0

Adds account recovery, inactivity locking, patient-presence awareness, clinical/access auditing, consultation draft recovery, clinical alerts, notification centre, document versioning, recoverable deletes and Management system status while preserving the existing UI. Break-glass access is not included. See `docs/RECORDSWEB-2.7.0-SECURITY-RECOVERY-AUDIT.md`.


## RecordsWeb 3.1.0

- Organisation-wide Management-controlled maintenance mode.
- Compact maintenance screen uses the existing login-window dimensions and styling.
- Management-only access remains available during maintenance so the system cannot be locked permanently.
- Signed-in ordinary staff receive a 60-second save-work warning when maintenance begins.
- Maintenance changes are audited.
- Fixed the login RPC Promise handling that could expose `rpc(...).catch is not a function`.

Run `supabase/recordsweb-3.1.0.sql` before enabling maintenance mode.


## RecordsWeb 3.1.1 maintenance hotfix

Run `supabase/recordsweb-3.1.1.sql` after the 3.1.0 maintenance migration. This resolves the PostgreSQL `organisation_code is ambiguous` error when Management enables, disables, or saves maintenance mode.

## RecordsWeb 3.1.3 staff session visibility

Management Staff Accounts now shows signed-in/signed-out state and the most recent RecordsWeb session. Clicking a staff profile opens Management-only overview, session history and staff-specific audit activity. Run `supabase/recordsweb-3.1.3.sql` once before using this feature.

## 3.1.5

- Issued fit notes open in Documents as read-only PDF records.
- Fit notes are locked after issue/signing and cannot be edited or deleted.
- Existing issued fit notes are backfilled as locked by the v3.1.5 migration.

## RecordsWeb 3.1.9 login focus hotfix

Version 3.1.9 fixes an intermittent Electron focus problem after signing out where the Username and Password fields could stop accepting keyboard input. The login/app route now exclusively owns Electron window-mode switching, duplicate resize requests from the authentication context were removed, and the login field explicitly regains focus after the compact login window settles. No Supabase migration is required.


## macOS build (GitHub Actions)

RecordsWeb now has a Universal macOS target. It produces a DMG for manual installation plus a ZIP and `latest-mac.yml` for `electron-updater`.

Local macOS build command:

```bash
npm install
npm run package:mac
```

The supplied repository workflow is intended to live at `.github/workflows/build-macos.yml` while this desktop source lives at `/desktop`. Run the workflow with the existing GitHub Release tag (for example `v3.2.0`) and it uploads the macOS assets to that same release alongside the Windows EXE.

**Important:** macOS automatic updates require the application to be signed. An unsigned GitHub build can be generated for testing/manual installation, but automatic updating will only work once an Apple Developer `Developer ID Application` certificate is configured in GitHub Actions. See `MAC-BUILD-README.md` in the repo integration bundle.
