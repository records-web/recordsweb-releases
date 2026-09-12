# RecordsWeb 3.4.1 — Discord Canvas Login DMs

RecordsWeb 3.4.1 upgrades the community Discord integration so login details can be delivered as a branded RecordsWeb image rather than a plain Discord embed.

## What changed

- The official RecordsWeb Bot can DM a dynamically rendered RecordsWeb login card.
- The card is generated with `@napi-rs/canvas` and visually follows the RecordsWeb desktop login window.
- The image contains the user's RecordsWeb username, temporary password and organisation code.
- The Discord message also contains the RecordsWeb staff-area URL.
- Password-reset + Discord delivery now happens in one authenticated server operation. This fixes the case where a management user resets their own password and the second request fails because their previous session is no longer authorised.
- If the Canvas renderer is not configured, the existing Discord embed is retained as a compatibility fallback.

## Components

### `discord-bot-service/`

A small Node.js service which:

1. Accepts an authenticated internal request from the Supabase `recordsweb-discord` Edge Function.
2. Generates a 1200×760 PNG with the Canvas API.
3. Opens a Discord DM with the linked staff member.
4. Sends the PNG as `recordsweb-login-details.png`.

The service never stores the temporary password.

### `supabase/functions/recordsweb-discord`

The Edge Function now supports `reset_password: true` on `send-login-dm`. It validates the current management session first, then performs the password reset and Discord delivery in the same server request.

## Environment variables

### Canvas service

Set these on the Node host running `discord-bot-service`:

```text
RECORDSWEB_DISCORD_BOT_TOKEN=<official RecordsWeb bot token>
RECORDSWEB_DISCORD_RENDERER_SECRET=<long random shared secret>
RECORDSWEB_PUBLIC_URL=https://www.recordsweb.org
RECORDSWEB_VERSION=3.4.1
```

### Supabase Edge Function secrets

Set:

```bash
supabase secrets set RECORDSWEB_DISCORD_RENDERER_URL="https://YOUR-CANVAS-SERVICE"
supabase secrets set RECORDSWEB_DISCORD_RENDERER_SECRET="THE-SAME-LONG-RANDOM-SECRET"
supabase secrets set RECORDSWEB_VERSION="3.4.1"
```

Keep the existing Discord and RecordsWeb secrets from 3.4.0 as well.

## Deploy

1. Deploy `discord-bot-service` to a Node 20+ host.
2. Confirm `GET /health` returns `{ "ok": true }`.
3. Add `RECORDSWEB_DISCORD_RENDERER_URL` and `RECORDSWEB_DISCORD_RENDERER_SECRET` to Supabase secrets.
4. Redeploy the `recordsweb-discord` Edge Function.
5. Deploy/build the updated RecordsWeb app/website.
6. In **Management → Staff accounts**, choose **DM login** for a staff member with a linked Discord User ID.

## Security notes

- Only temporary passwords should be sent by Discord.
- RecordsWeb continues to require the user to change the temporary password at their next sign-in.
- Temporary passwords are rendered in memory and are not written to the Canvas service filesystem.
- The Canvas service is protected with an internal shared secret and the Discord bot token remains server-side.
- Audit logs record that a Discord login DM was sent, but do not record the password.
