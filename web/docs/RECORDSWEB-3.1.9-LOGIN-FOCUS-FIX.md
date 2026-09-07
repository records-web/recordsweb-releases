# RecordsWeb 3.1.9 — Login focus reliability

This hotfix addresses the intermittent Electron login issue where the Username and Password fields could stop accepting keyboard input after signing out.

Changes:

- The login page now explicitly restores keyboard focus after the compact Electron login window finishes resizing.
- Focus is recovered if Windows temporarily drops renderer focus during the logout/login transition.
- Duplicate `setWindowMode` calls were removed from the authentication context; the visible login/app route now owns its window mode.
- Electron window-mode changes are idempotent, preventing two simultaneous login resize operations from fighting for focus.
- The packaged application version is now 3.1.9.

No Supabase migration is required for this hotfix.
