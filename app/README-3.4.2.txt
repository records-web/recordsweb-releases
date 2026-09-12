RecordsWeb 3.4.2 Web Source

Release 3.4.2 updates the Discord login-DM delivery:
- Discord staff login DMs now send the generated PNG only.
- No Discord embed, content message, credential text fallback, or embed fallback is used.
- The generated card closely follows the RecordsWeb desktop Login UI.
- The official RecordsWeb logo is loaded from https://cdn.recordsweb.org/RW-Logo.png.
- Supabase remains the only Discord service backend; no separate Vercel renderer is required.

Deploy after updating RECORDSWEB_VERSION to 3.4.2:
  supabase functions deploy recordsweb-discord --project-ref cdakocrmfstsknbgugkc
  supabase functions deploy recordsweb-admin --project-ref cdakocrmfstsknbgugkc
