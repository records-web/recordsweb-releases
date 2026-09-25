# RecordsWeb 5.0.0 deployment

## Required database migration

Run this in Supabase SQL Editor before deploying the new application source:

```text
supabase/recordsweb-5.0.0-products-policing.sql
```

The migration keeps all existing organisations on RecordsWeb Clinical and adds the RecordsWeb Policing data model/product-entitlement system.

## Edge Functions

Deploy the updated Platform Admin function:

```powershell
supabase functions deploy recordsweb-platform-admin --no-verify-jwt --project-ref cdakocrmfstsknbgugkc
```

Recommended when using the RecordsWeb Discord login-card flow:

```powershell
supabase functions deploy recordsweb-discord --project-ref cdakocrmfstsknbgugkc
```

No new Supabase secret is required for the 5.0.0 product platform.

## Application deployment

Website:

```powershell
npm install
npm run build
```

Electron Windows package:

```powershell
npm install
npm run package:win
```

## After deployment

Open **Platform Management → Products & Testers** to configure each community as Clinical, Policing, Complete or Tester Programme.

Existing communities remain Clinical unless explicitly changed.
