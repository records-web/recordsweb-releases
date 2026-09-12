# RecordsWeb 3.4.2 — image-only Discord login DMs

RecordsWeb 3.4.2 keeps the Discord integration entirely in the Supabase `recordsweb-discord` Edge Function.

## Login DMs

When Management uses **DM login** / **Set password & send DM**, the bot now sends exactly one attachment:

- `recordsweb-login-details.png`

There is no Discord embed, no accompanying message text and no plaintext credential fallback. If the image cannot be generated or delivered, the operation reports an error instead of sending credentials another way.

The image is styled after the RecordsWeb desktop Login UI and contains:

- official RecordsWeb logo
- RecordsWeb version and organisation name
- username
- temporary password
- staff-area address
- organisation code
- RecordsWeb Supabase connection footer
- password-change / privacy notice

The official logo is loaded from:

`https://cdn.recordsweb.org/RW-Logo.png`

An optional `RECORDSWEB_LOGO_URL` Supabase secret can override that URL if required.

## Required Supabase secrets

```text
RECORDSWEB_DISCORD_BOT_TOKEN
RECORDSWEB_DISCORD_CLIENT_ID
RECORDSWEB_PUBLIC_URL=https://www.recordsweb.org
RECORDSWEB_VERSION=3.4.2
```

No renderer URL or renderer secret is required.

## Deploy

```powershell
supabase secrets set RECORDSWEB_VERSION="3.4.2" --project-ref cdakocrmfstsknbgugkc
supabase functions deploy recordsweb-discord --project-ref cdakocrmfstsknbgugkc
supabase functions deploy recordsweb-admin --project-ref cdakocrmfstsknbgugkc
```

The existing 3.4.0 Discord database migration remains the correct schema migration. No additional SQL migration is required for the image-only DM change.
