# RecordsWeb 3.3.6 — Public automated status page

RecordsWeb now exposes `/status`, a public service-health page styled to match RecordsWeb.

## Automated checks

The page refreshes every 30 seconds and obtains its state from `/api/status`. There is no management control that can manually mark a component operational.

Current checks cover:

- RecordsWeb Website / Vercel runtime
- Staff Authentication / Supabase Auth
- Clinical Data Service / Supabase PostgREST
- Document & File Storage / Supabase Storage gateway
- RecordsWeb API & Roblox Bridge / `https://api.recordsweb.org`
- Software Updates & Downloads / GitHub Releases

The page displays current automatically detected incidents for components that are degraded, unavailable or whose check cannot run.

## Environment variables

The status API reads the same Supabase configuration already used by the web app (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`). It also uses `VITE_RECORDSWEB_GAME_API_URL`, falling back to `https://api.recordsweb.org`. An optional server-side `RECORDSWEB_GAME_API_URL` override may be configured.

No SQL migration is required.
