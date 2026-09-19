# RecordsWeb 4.1.0 — 24/7 Discord Bot

RecordsWeb 4.1.0 moves Discord delivery to a permanent Discord worker hosted separately from the RecordsWeb website.

## Architecture

```text
Website / Electron
       |
       v
recordsweb-discord Edge Function
       |
       v
Supabase Discord job queue
       |
       v
recordsweb-bot-api Edge Function
       ^
       |
24/7 RecordsWeb Bot (X Systems Hosting)
       |
       v
Discord
```

The Discord bot token exists only on the external bot host. The browser, Electron app and Vercel deployment do not receive it.

## Features moved to the worker

- Community test messages
- Platform announcements
- Maintenance broadcasts
- Staff login-detail DMs
- Patient prescription DMs
- Patient fit-note DMs
- Delivery retry handling
- Discord guild/channel discovery
- Bot health and heartbeat
- Slash commands

## Website-managed custom commands

Platform Management now contains:

`Discord -> Commands`

Platform operators can create, edit, enable/disable and delete custom slash commands. The external bot synchronises command changes approximately every 60 seconds.

Website-managed commands support these placeholders:

- `{{user}}`
- `{{server}}`
- `{{recordsweb_url}}`

The bot package also supports source-code commands by placing `.js` command modules into `src/commands` and restarting the bot.

## Required migration

Run:

```text
supabase/recordsweb-4.1.0-discord-worker.sql
```

## Deploy Edge Functions

```powershell
supabase functions deploy recordsweb-discord --project-ref cdakocrmfstsknbgugkc
supabase functions deploy recordsweb-security --no-verify-jwt --project-ref cdakocrmfstsknbgugkc
supabase functions deploy recordsweb-bot-api --no-verify-jwt --project-ref cdakocrmfstsknbgugkc
```

## Create the bot API secret

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$secret = [Convert]::ToBase64String($bytes)
supabase secrets set RECORDSWEB_BOT_API_SECRET="$secret" --project-ref cdakocrmfstsknbgugkc
$secret
```

Copy the same value into X Systems Hosting as `RECORDSWEB_BOT_API_SECRET`.

## Bot host environment

```text
DISCORD_BOT_TOKEN=<Discord bot token>
SUPABASE_URL=https://cdakocrmfstsknbgugkc.supabase.co
RECORDSWEB_BOT_API_SECRET=<matching secret>
RECORDSWEB_PUBLIC_URL=https://www.recordsweb.org
RECORDSWEB_VERSION=4.1.0
RECORDSWEB_BOT_HOST=X Systems Hosting
```

## Security notes

- The bot does not require the Supabase service-role key.
- The Discord bot token is not required by the website/Electron app.
- Protected attachments are queued only while delivery is pending/retrying.
- Queue payloads flagged as sensitive are redacted after delivery or final failure.
- Failed jobs retry automatically up to the configured attempt limit.
- The bot reports its guild/channel inventory to RecordsWeb; Community Management reads that server-side cache instead of calling Discord directly.
