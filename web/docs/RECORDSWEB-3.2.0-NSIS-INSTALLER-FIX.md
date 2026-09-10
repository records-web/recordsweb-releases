# RecordsWeb 3.2.0 — Windows NSIS installer fix

The custom organisation-extension installer page is installer-only.

Electron Builder first compiles a helper uninstaller with `BUILD_UNINSTALLER` defined. The previous custom `installer.nsh` expanded `${isUpdated}` during that helper-uninstaller compile, where the StdUtils plugin is not available, causing `StdUtils::TestParameter` to fail.

The entire custom organisation installer include is now guarded with `!ifndef BUILD_UNINSTALLER`, so it is omitted from the helper-uninstaller compile and remains active for the real installer.

Fresh Windows installs still request the `@XX.XX` organisation extension. Updater-driven installs still preserve the configured organisation and legacy installs can still seed `GW.HC`.
