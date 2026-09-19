# RecordsWeb 4.1.0 deployment

1. Run `supabase/recordsweb-4.1.0-discord-worker.sql` in Supabase SQL Editor.
2. Set `RECORDSWEB_BOT_API_SECRET` in Supabase.
3. Deploy `recordsweb-discord`.
4. Redeploy `recordsweb-security` with JWT verification disabled; Discord verification DMs now use the worker queue.
5. Deploy `recordsweb-bot-api` with JWT verification disabled.
6. Deploy the separate RecordsWeb 4.1.0 Discord Bot package to X Systems Hosting.
7. Put the same `RECORDSWEB_BOT_API_SECRET` value on the bot host.
8. Put `DISCORD_BOT_TOKEN` only on the bot host.
9. Start the bot and confirm Platform Management -> Discord reports ONLINE.
10. Build/deploy the Website and Electron app normally.

See `docs/RECORDSWEB-4.1.0-24-7-DISCORD-BOT.md` for full details.
