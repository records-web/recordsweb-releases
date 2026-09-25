# RecordsWeb 5.2.0 deployment

## 1. Database

Open the Supabase SQL Editor for project `cdakocrmfstsknbgugkc` and run:

`supabase/recordsweb-5.2.0-policing-record-details.sql`

This creates the Policing operational-update timeline and the organisation/RLS/integrity rules used by the new record detail pages.

## 2. Website

Install dependencies if required, then build/deploy normally:

```powershell
npm install
npm run build
```

Deploy the generated web application through the existing RecordsWeb website workflow.

## 3. Electron

Install dependencies if required and package normally:

```powershell
npm install
npm run package:win
```

## 4. Edge Functions

No Edge Function redeployment is required for RecordsWeb 5.2.0.

## 5. Secrets

No new Supabase or LiveKit secrets are required by this release.
