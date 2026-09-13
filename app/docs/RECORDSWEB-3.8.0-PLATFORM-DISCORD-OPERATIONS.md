# RecordsWeb 3.8.0 — Platform Discord Operations

RecordsWeb 3.8.0 adds a restricted Discord Operations workspace to Platform Management for the single official RecordsWeb Bot.

## Platform Management features

- Overview of the bot and connected community status channels.
- Platform announcements to all connected communities, selected care settings, or selected communities.
- Maintenance lifecycle messages: planned, started, update, and complete.
- Optional affected-service and maintenance timing fields.
- Connected-server inventory with community, Discord guild and allocated status channel.
- Per-community test-message action.
- Discord connection health checks against every configured status channel.
- Persistent delivery logs for sent, failed and skipped deliveries.
- Retry of failed deliveries without intentionally re-sending successful targets.
- Audit-log entries for platform broadcasts, tests and health checks.

## Community Management changes

The existing RecordsWeb Bot page continues to control the community's Discord server and channel. The channel is now described as the **RecordsWeb status channel** because it receives platform announcements, incidents and maintenance notices.

Community Management can control:

- Automatic maintenance messages.
- General platform announcements.
- Staff login-detail DMs.

Critical platform notices remain enabled for connected communities.

## Deployment

1. Run `supabase/recordsweb-3.8.0-platform-discord-operations.sql` after the existing Discord integration migration.
2. Redeploy the `recordsweb-discord` Edge Function.
3. Ensure the Edge Function still has `RECORDSWEB_DISCORD_BOT_TOKEN` configured, plus the existing RecordsWeb Discord secrets.
4. Open Platform Management → Discord and run **Bot Health → Run health check**.

The Discord bot token remains server-side and is never returned to the browser or stored in the RecordsWeb database.
