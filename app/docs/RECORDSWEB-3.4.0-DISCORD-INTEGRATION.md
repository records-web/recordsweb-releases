# RecordsWeb 3.4.0 — Discord Bot integration

RecordsWeb 3.4.0 adds one platform-owned **RecordsWeb Bot** that can be installed into each approved community's Discord server.

## What it does

- A community Management user can add the official RecordsWeb Bot to its Discord server.
- Management allocates one text/announcement channel for automatic platform maintenance notifications.
- Platform maintenance start/end events are broadcast automatically from the restricted RecordsWeb platform-management page to every connected community that has maintenance notifications enabled.
- Staff profiles can store an optional Discord User ID.
- Management can create a staff account and immediately DM the new username + temporary password through RecordsWeb Bot.
- Management can use **DM login** on an existing staff account. RecordsWeb sets a new temporary password, forces a password change at next sign-in, then DMs the new login details.
- Bot/server/channel state, last verification and errors are visible under **Management → Discord bot**.
- The integration includes a **Send test message** action before relying on automatic maintenance notices.

## Security model

The Discord bot token is **server-side only**. It must never be added to a Vite `.env`, Electron package, website bundle, Supabase table, or Git repository.

RecordsWeb never retrieves or stores an existing staff password for Discord. A login DM is sent only after Management explicitly creates an account or explicitly resets the user's password. The temporary password is passed to the Edge Function for that request and is not written to the Discord integration table or audit log.

Discord User IDs are stored on the staff profile so Management can deliberately address a specific staff member. Discord DMs are not bulk/broadcast DMs; each one is initiated by a Management action.

## 1. Create the single RecordsWeb Discord application

1. Open the Discord Developer Portal.
2. Create one application named **RecordsWeb**.
3. Open **Bot** and create/enable the bot user if needed.
4. Set the bot display name/avatar as desired.
5. Copy the **bot token**. Keep this private.
6. Under the application installation/default install settings, allow a **Guild Install** with the bot scope. RecordsWeb uses only:
   - View Channel
   - Send Messages
   - Embed Links
7. Privileged Gateway intents are not required for this integration because RecordsWeb uses Discord's REST API rather than a persistent Gateway connection.

The RecordsWeb Management screen builds the install URL automatically from the bot identity. `applications.commands` is included in the install scope so the application is ready for future RecordsWeb commands, although v3.4.0 does not depend on slash commands.

## 2. Run the Supabase migration

Run:

```text
supabase/recordsweb-3.4.0-discord-integration.sql
```

This adds:

- `profiles.discord_user_id`
- `recordsweb_discord_integrations`

The integration table is intentionally not readable directly by normal anon/authenticated clients. Community operations go through the secured Edge Function.

## 3. Configure Supabase Edge Function secrets

From a terminal authenticated to the RecordsWeb Supabase project:

```bash
supabase secrets set RECORDSWEB_DISCORD_BOT_TOKEN="YOUR_DISCORD_BOT_TOKEN"
supabase secrets set RECORDSWEB_DISCORD_CLIENT_ID="YOUR_DISCORD_APPLICATION_ID"
supabase secrets set RECORDSWEB_PUBLIC_URL="https://www.recordsweb.org"
```

`RECORDSWEB_DISCORD_CLIENT_ID` is optional because the function can normally use the bot user ID as the client/application ID, but setting it explicitly is recommended.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to deployed Supabase Edge Functions by the project environment in the same way as the existing RecordsWeb admin functions.

## 4. Deploy the Edge Functions

Deploy the new function:

```bash
supabase functions deploy recordsweb-discord
```

Because staff account creation/editing now stores Discord User IDs, redeploy the existing admin function too:

```bash
supabase functions deploy recordsweb-admin
```

## 5. Connect a community Discord server

In that community's RecordsWeb environment:

1. Sign in with a Management account.
2. Open **Management → Discord bot**.
3. Click **Add bot to Discord**.
4. Choose the community's Discord server in Discord's install screen.
5. In Discord, enable **Developer Mode** under User Settings → Advanced.
6. Right-click the server → **Copy Server ID**.
7. Paste the Server ID into RecordsWeb and click **Load channels**.
8. Choose the channel that should receive maintenance messages.
9. Leave **Automatic maintenance messages** enabled.
10. Leave **Staff login DMs** enabled if the community wants to use credential delivery.
11. Click **Connect community** / **Save & verify**.
12. Click **Send test message** and confirm it appears in the chosen channel.

A Discord server can host more than one RecordsWeb community if each community allocates a different channel. The same Discord channel cannot be assigned to two different RecordsWeb communities.

## 6. Link a staff member to Discord

Open **Management → Staff accounts → Edit** for the staff member.

Paste their Discord User ID into **Discord User ID**. To copy it, enable Discord Developer Mode, right-click the user, and choose **Copy User ID**.

### New staff account

When creating an account and a Discord User ID is present, RecordsWeb shows:

**Send login details by Discord DM after account creation**

If selected, the account is created first and RecordsWeb Bot then sends:

- Community name and RecordsWeb extension
- RecordsWeb username
- Temporary password
- Staff sign-in link
- Reminder that a password change is required at next sign-in

### Existing staff account

The Staff Accounts table shows **DM login** for linked staff.

Selecting it opens a temporary-password dialog. RecordsWeb:

1. validates the new password,
2. resets the Supabase Auth password,
3. keeps `must_change_password = true`,
4. sends the new username/password by DM,
5. writes an audit event without recording the password.

If Discord rejects the DM, the password reset still succeeds and RecordsWeb reports that the DM failed. The manager can then provide the temporary password another way or correct the Discord User ID and reset again with a different temporary password.

## 7. Automatic platform maintenance messages

Platform operators continue to control maintenance from the restricted RecordsWeb website operator area.

When maintenance changes from **off → on**, RecordsWeb calls the Discord Edge Function after the platform state is saved. Every connected community with automatic notifications enabled receives an embed showing:

- Maintenance status
- Maintenance message
- Estimated completion if supplied
- Affected RecordsWeb services
- Community name and extension
- RecordsWeb status-page link
- Timestamp / platform operations footer

When maintenance changes from **on → off**, the bot sends an operational/restored notice.

Editing the maintenance text without changing the maintenance state does not broadcast a new Discord message, which avoids unnecessary channel spam.

## Discord bot permissions

The generated install URL requests permission value `19456`, which is the combination used by RecordsWeb for:

- View Channel
- Send Messages
- Embed Links

If a community later applies a channel overwrite that blocks the bot, **Send test message** will report the Discord permission error.

## Relevant files

- `src/components/management/DiscordIntegrationPanel.jsx`
- `src/lib/discordIntegrationService.js`
- `src/components/management/StaffAccountModal.jsx`
- `src/components/management/StaffAccountsPanel.jsx`
- `src/components/management/ResetPasswordModal.jsx`
- `supabase/functions/recordsweb-discord/index.ts`
- `supabase/functions/recordsweb-admin/index.ts`
- `supabase/recordsweb-3.4.0-discord-integration.sql`

