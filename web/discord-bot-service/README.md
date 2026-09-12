# RecordsWeb Discord Bot Canvas Service — 3.4.1

This service generates the branded RecordsWeb login-detail image with the Canvas API and sends it as a Discord DM using the one official RecordsWeb Bot.

It uses `@napi-rs/canvas`, which provides a Node Canvas API without requiring a local Cairo build.

## Environment

Copy `.env.example` into your hosting provider's environment variables:

- `RECORDSWEB_DISCORD_BOT_TOKEN` — official RecordsWeb Bot token.
- `RECORDSWEB_DISCORD_RENDERER_SECRET` — a long random shared secret. The same value is added to Supabase Edge Function secrets.
- `RECORDSWEB_PUBLIC_URL` — normally `https://www.recordsweb.org`.
- `RECORDSWEB_VERSION` — `3.4.1`.
- `PORT` — optional. Defaults to `8787`.

## Run locally

```bash
npm install
npm start
```

Test health:

```text
GET /health
```

The Supabase `recordsweb-discord` Edge Function calls:

```text
POST /send-login-card
x-recordsweb-secret: <shared secret>
```

Do not expose the shared secret or bot token to the React/Vite client.
