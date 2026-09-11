# RecordsWeb 3.2.2 — Community creation

Community creation is available only in the website Platform Management area. It is not included in the Electron community Management interface.

## Operator workflow

1. Sign in to `/#/platform-management` with a reserved `gus.farnsworth@XX.XX` platform operator account.
2. Open **Communities**.
3. Enter the community name, approved `@XX.XX` extension, RecordsWeb mode, default location and a password for the reserved account.
4. RecordsWeb creates the organisation and the reserved account `gus.farnsworth@XX.XX` in one protected server-side operation.

The reserved account is created as an active Management account. General Practitioner communities receive the `GP Partner` role; Hospital communities receive the `Practice Manager` role until the Hospital-specific role model is introduced.

## Supabase deployment

Run `supabase/recordsweb-3.2.2-community-creation.sql`, then deploy the Edge Function:

```bash
supabase functions deploy recordsweb-platform-admin
```

`SUPABASE_SERVICE_ROLE_KEY` stays inside Supabase Edge Functions and must never be added to Vercel or a `VITE_` environment variable.
