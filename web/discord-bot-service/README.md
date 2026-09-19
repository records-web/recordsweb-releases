# RecordsWeb Discord Bot moved in 4.1.0

The old HTTP renderer service is retired. RecordsWeb 4.1.0 uses the separate always-on `RecordsWeb-4.1.0-Discord-Bot.zip` package.

The website/Electron app now queues Discord work through Supabase; the external bot claims jobs using `recordsweb-bot-api`.

Do not place the Discord bot token in this project.
