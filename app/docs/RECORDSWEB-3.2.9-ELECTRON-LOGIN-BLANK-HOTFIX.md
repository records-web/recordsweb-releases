# RecordsWeb 3.2.9 — Electron login blank-screen hotfix

## Fixed

The Electron renderer could become blank immediately after a successful sign-in because the desktop `AppShell` referenced the billing-access state setters/values without initialising that React state. The billing warning icons were also missing from the Electron-specific imports.

The Electron `AppShell` now restores:

- `billingAccess` / `setBillingAccessState` state initialisation
- `CreditCard` and `TriangleAlert` icon imports used by billing grace/read-only banners

No database migration is required for this hotfix.
