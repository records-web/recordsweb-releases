# RecordsWeb 5.1.0 — Live bodycams

RecordsWeb Policing now includes live body-worn video using LiveKit Cloud.

## What is included

- `/policing/bodycams` operations page.
- Screen/window/tab publishing from the Website and Electron app.
- Optional microphone publishing.
- Live bodycam viewer grid and full viewer modal.
- Incident linking, callsign, camera ID and location metadata.
- Persistent BODYCAM LIVE indicator while the publishing session is active.
- XION-ChaseCam-inspired top-right overlay, dynamically populated by RecordsWeb.
- Supabase session/view metadata and RecordsWeb audit events.
- Automatic stale-session cleanup after missed heartbeats.

This release is **live-only**. RecordsWeb does not record or store the video stream. LiveKit Cloud carries the live media.

## LiveKit Cloud secrets

Set these Supabase Edge Function secrets using the values from your LiveKit Cloud project:

```powershell
supabase secrets set LIVEKIT_URL="wss://YOUR-PROJECT.livekit.cloud" --project-ref cdakocrmfstsknbgugkc
supabase secrets set LIVEKIT_API_KEY="YOUR_LIVEKIT_API_KEY" --project-ref cdakocrmfstsknbgugkc
supabase secrets set LIVEKIT_API_SECRET="YOUR_LIVEKIT_API_SECRET" --project-ref cdakocrmfstsknbgugkc
```

Never expose `LIVEKIT_API_SECRET` in Vite environment variables, Website JavaScript or Electron renderer code. The secret remains server-side in the Edge Function. RecordsWeb issues short-lived publish/subscribe tokens.

## Deploy

1. Run `supabase/recordsweb-5.1.0-livekit-bodycams.sql` in the Supabase SQL Editor.
2. Deploy the token/session function:

```powershell
supabase functions deploy recordsweb-bodycam --no-verify-jwt --project-ref cdakocrmfstsknbgugkc
```

3. Redeploy the Website and rebuild Electron.

## XION-ChaseCam attribution

The bodycam HUD layout is a RecordsWeb reimplementation/adaptation of the free-to-use XION-ChaseCam roleplay overlay by `zhivotnoya`:

https://github.com/zhivotnoya/XION-ChaseCam

The original repository describes the overlay as free-to-use and implements a transparent, top-right bodycam display. RecordsWeb does not bundle the repository's font files or AXON-branded artwork; it recreates the layout using system fonts and RecordsWeb/generic bodycam text.
