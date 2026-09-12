RecordsWeb 3.4.1 Web Source
===========================

Includes:
- Web / Vite source
- Supabase SQL / Edge Function source
- supabase/functions/recordsweb-discord/  Supabase-only Discord bot + branded login-image renderer

Main change in 3.4.1:
The official RecordsWeb Bot generates branded login-detail PNGs directly inside the Supabase Edge Function and sends them to staff by Discord DM. No separate Vercel/Node renderer service is required. Password-reset + DM delivery runs in one authorised server request.

Read:
RECORDSWEB-3.4.1-DISCORD-CANVAS-DMS.md
