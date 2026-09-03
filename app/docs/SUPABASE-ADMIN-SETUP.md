# RecordsWeb Supabase Admin Function

RecordsWeb creates Supabase Authentication users through the `recordsweb-admin` Edge Function.

## Why a service-role key is needed

Creating Auth users, resetting another user's password, and using other `auth.admin` methods require Supabase's **service-role** privileges.

The service-role key must **never** be included in the Electron/Vite `.env` file, because `VITE_*` values are bundled into the client application.

The deployed Edge Function uses these server-side variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

On Supabase Hosted Edge Functions these are provided automatically by Supabase.

## Deploy or redeploy the function

From the RecordsWeb project directory:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy recordsweb-admin
```

For the current project URL, the project ref is the hostname prefix before `.supabase.co`.

After changing `supabase/functions/recordsweb-admin/index.ts`, run the deploy command again.

## Client `.env`

The desktop app only needs the public client credentials:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_SERVICE_ROLE_KEY`.

## Management account requirement

The signed-in user's row in `public.profiles` must have:

```text
active = true
is_management = true
```

The Edge Function checks this before performing any Auth Admin operation.

## Verify it in RecordsWeb

Open **Management**. The management summary now includes **Admin service**:

- `Online` — the function is deployed, the current token is valid, Management access is confirmed, and the service-role client is available.
- `Unavailable` — hover the status to see the returned error, and check the Edge Function logs in Supabase.

## If you still get an error

Open Supabase → Edge Functions → `recordsweb-admin` → Logs.

Common causes:

1. The function has not been deployed after a source-code update.
2. The current Auth user does not have a matching `profiles` row.
3. `profiles.is_management` is false.
4. The user's session is expired.
5. The function is running outside Supabase Hosted Edge Functions and the service-role secret was not supplied to that server environment.
