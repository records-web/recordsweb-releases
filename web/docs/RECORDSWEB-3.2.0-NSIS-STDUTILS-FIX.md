# RecordsWeb 3.2.0 — NSIS StdUtils packaging fix

This build removes `${isUpdated}` from the custom `build/installer.nsh` include.

With electron-builder 25.x the custom include can be parsed before the StdUtils
plugin directory is available. Expanding `${isUpdated}` there causes makensis to
fail with `Plugin not found, cannot call StdUtils::TestParameter`.

RecordsWeb now detects an existing installation using electron-builder's stable
`${INSTALL_REGISTRY_KEY}` in HKCU/HKLM during `customInit` instead.

Behaviour is preserved:

- Fresh interactive installs show the `@XX.XX` organisation extension page.
- Existing multi-organisation installs preserve their stored extension.
- Legacy RecordsWeb upgrades without an extension are automatically seeded to
  `GW.HC`, so an auto-update never blocks on the organisation page.
- Silent fresh installs fall back to the in-app first-launch organisation gate.
- Runtime registry recovery checks both HKCU and HKLM.
