# RecordsWeb 3.4.1 — Discord image DMs (Supabase-only)

RecordsWeb Bot now generates the branded staff-login image **inside the existing `recordsweb-discord` Supabase Edge Function**. There is no separate Node, Vercel, Railway, Render, or Canvas service to deploy.

## Architecture

```text
RecordsWeb Web / Electron
        |
        v
Supabase Edge Function: recordsweb-discord
        |
        +-- generates a 1200x800 RecordsWeb login PNG in memory
        |   using `@vercel/og` `ImageResponse` in the Supabase Deno runtime
        |
        +-- sends the PNG to Discord through the Discord REST API
        v
Staff member Discord DM
```

`@vercel/og` is only the image-rendering package. The renderer itself runs in **Supabase Edge Functions**; Vercel hosting is not required. Supabase documents `ImageResponse` as a supported pattern for generating images from Edge Functions.

## What the DM contains

The generated image follows the RecordsWeb desktop sign-in visual language:

- RecordsWeb branding and clinical-platform header
- community / organisation name and `@ORG.CODE`
- staff RecordsWeb username
- temporary password
- staff-area address
- confidential/security guidance
- RecordsWeb version and generation timestamp

The temporary password is generated/reset server-side by the existing authenticated request. RecordsWeb sets `must_change_password = true`, so the staff member is prompted to choose a new password on sign-in.

If image rendering fails unexpectedly, the function retains the plain Discord embed as a fallback so the account workflow does not become unusable.

## Required Supabase secrets

Set the following on the RecordsWeb Supabase project:

```powershell
supabase secrets set RECORDSWEB_DISCORD_BOT_TOKEN="YOUR_DISCORD_BOT_TOKEN" --project-ref cdakocrmfstsknbgugkc
supabase secrets set RECORDSWEB_DISCORD_CLIENT_ID="YOUR_DISCORD_APPLICATION_ID" --project-ref cdakocrmfstsknbgugkc
supabase secrets set RECORDSWEB_PUBLIC_URL="https://www.recordsweb.org" --project-ref cdakocrmfstsknbgugkc
supabase secrets set RECORDSWEB_VERSION="3.4.1" --project-ref cdakocrmfstsknbgugkc
```

The standard Supabase-managed environment values `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are also used by the function.

You **do not** need these old renderer values anymore:

```text
RECORDSWEB_DISCORD_RENDERER_URL
RECORDSWEB_DISCORD_RENDERER_SECRET
```

They can be removed if you previously created them.

## Deploy

From the project root:

```powershell
supabase functions deploy recordsweb-discord --project-ref cdakocrmfstsknbgugkc
supabase functions deploy recordsweb-admin --project-ref cdakocrmfstsknbgugkc
```

The Discord integration SQL remains:

```text
supabase/recordsweb-3.4.0-discord-integration.sql
```

Run that migration once if it has not already been installed.

## Community setup

In RecordsWeb:

```text
Management
  -> Discord bot
  -> Add RecordsWeb Bot to the community Discord server
  -> enter the server ID
  -> load channels
  -> select the maintenance channel
  -> Save & verify
  -> Send test message
```

After that, Management can add a Discord User ID to a staff account and use **DM login** / **Set password & send DM**.

## Maintenance notifications

The same `recordsweb-discord` function continues to publish automatic maintenance-start and maintenance-complete embeds to every connected community that has maintenance notifications enabled. No additional service is required.

## Security notes

- The Discord bot token remains a Supabase secret and is never exposed to React/Vite/Electron.
- Do not create a `VITE_` bot-token environment variable.
- Login-card PNGs are generated in memory and sent directly to Discord; RecordsWeb does not intentionally store the generated image.
- Plain-text temporary passwords are not written to the RecordsWeb audit log.
- Discord delivery is intended for temporary passwords only, with a password change required at the next sign-in.
