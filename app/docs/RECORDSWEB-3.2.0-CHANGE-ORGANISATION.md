# RecordsWeb 3.2.0 — Change organisation

RecordsWeb installations can now switch their configured organisation from the sign-in screen without reinstalling the desktop application.

## Sign-in screen

The footer displays the current organisation and a **Change organisation** action. The action opens a RecordsWeb dialog pre-filled with the current `@XX.XX` extension.

When an extension is submitted RecordsWeb:

1. Validates the `@XX.XX` format.
2. Uses `recordsweb_public_organisation_config` to verify the organisation is registered and active when Supabase is configured.
3. Writes the new organisation to the desktop installation config and the Windows RecordsWeb registry key.
4. Stores the matching browser-side installation namespace.
5. Reloads the renderer so all organisation-specific storage keys, branding and login services are rebuilt using the new organisation.

The user remains signed out and must authenticate with an account belonging to the selected organisation.

No additional Supabase migration is required beyond `supabase/recordsweb-3.1.9-multi-organisation.sql`.
