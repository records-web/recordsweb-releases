# RecordsWeb 5.1.0

## RecordsWeb Policing — Live Bodycams

Version 5.1.0 adds a LiveKit Cloud-backed bodycam workspace to RecordsWeb Policing.

- Start a live feed by sharing a screen, application window or browser tab.
- Optionally publish microphone audio; supported screen/system audio can also be carried with the share.
- View all currently live bodycams in the same RecordsWeb policing community.
- Link a stream to an active incident and add callsign, camera ID and location/patrol-area metadata.
- Keep the publisher active while moving between RecordsWeb policing pages using the global bodycam session provider.
- Show a persistent BODYCAM LIVE indicator in the application header.
- Audit bodycam start, stop and view events through RecordsWeb auditing.
- Automatically expire stale sessions when a publisher stops heartbeating.
- Live media is not stored by RecordsWeb 5.1.0.

The viewer uses a RecordsWeb adaptation of the XION-ChaseCam top-right roleplay overlay. See `THIRD-PARTY-NOTICES.md`.

Deployment instructions are in `RECORDSWEB-5.1.0-BODYCAMS.md`.
