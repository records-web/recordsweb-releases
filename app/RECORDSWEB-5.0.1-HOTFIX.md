# RecordsWeb 5.0.1 Hotfix

## Fixed

- Fixed Platform Management sign-in failing with `productPackage is not defined`.
- Removed the accidental `product_package` property from the Supabase `signInWithPassword` call. Product package selection remains part of community creation and product management, not authentication.
- Applied the fix to both Website and Electron source packages.

## Deployment

No SQL migration or Edge Function deployment is required for this hotfix. Rebuild/deploy the Website and Electron app from the updated source.
