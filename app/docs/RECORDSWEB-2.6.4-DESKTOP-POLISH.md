# RecordsWeb 2.6.4 — Desktop polish

This release intentionally keeps the existing RecordsWeb UI unchanged while tightening desktop behavior.

- All image elements are non-draggable.
- Image right-click context menus are suppressed.
- File drops onto the Electron renderer are ignored to prevent accidental navigation.
- Standard file picker inputs continue to work.
- Production refresh and DevTools keyboard shortcuts are blocked.
- Embedded webviews are rejected.
- Electron web security remains enabled explicitly.

No Supabase migration is required for this release.
