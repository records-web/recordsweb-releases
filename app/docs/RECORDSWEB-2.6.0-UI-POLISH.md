# RecordsWeb 2.6.0 UI polish

This build fixes several layout issues caused by legacy modal and context-menu styles.

- Modal portal containers are always transparent. Only the dialog itself is visible over the dimmed backdrop.
- Appointment and Staff Area dialogs stay centred and within the usable screen area.
- Dialog headers and action footers remain visible when a long dialog scrolls.
- Appointment right-click menus are clamped to the visible desktop and the Cancel slot status action no longer wraps into the icon column.
- Mandatory application updates show a 120-second real-time countdown. At zero, RecordsWeb starts the update automatically. Staff can select Update now to begin earlier.
- Electron renderer background throttling is disabled so the mandatory countdown continues while RecordsWeb is not the foreground window.

No Supabase schema changes are required for 2.6.0.
