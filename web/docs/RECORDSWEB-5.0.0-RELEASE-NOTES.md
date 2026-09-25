# RecordsWeb 5.0.0 — Release Notes

RecordsWeb 5.0.0 changes RecordsWeb from a clinical-only application into a multi-product roleplay operations platform.

## Products

- **RecordsWeb Clinical** — existing Primary Care, Hospital and Ambulance/PHEM workflows.
- **RecordsWeb Policing** — dedicated policing records and operational workflows.
- **RecordsWeb Complete** — Clinical + Policing enabled for the same organisation.
- **RecordsWeb Tester Programme** — platform-managed entitlement that unlocks all current products for QA/testing.

## RecordsWeb Policing 5.0.0

The first Policing workspace includes:

- Policing operations dashboard
- Person records and search
- Vehicle records and search
- Incident desk
- Fixed Penalty Notices (FPNs)
- Crime Reports
- Intelligence
- Statements
- Evidence
- Arrests
- Warrants
- Seizures
- Custody
- BOLO / Wanted
- Briefings
- Dispatch register

Policing data uses dedicated `police_*` tables and does not reuse or merge with Clinical patient tables.

## Product switching

Communities with Complete or Tester access can switch between Clinical and Policing from the RecordsWeb header. Shared pages such as Security, Settings, Management and Staff Area remember the active product context.

## Platform Management

A new **Products & Testers** section lets RecordsWeb platform operators:

- set Clinical, Policing, Complete or custom entitlement
- enable/disable individual products
- enrol/remove a community from the Tester Programme
- store entitlement/tester notes

New communities can choose their initial RecordsWeb package during provisioning.

## Public website

The public website now positions RecordsWeb as an operations platform using the tagline **Your daily operations** and includes Clinical, Policing and Complete product information. Access requests can specify the requested product package.

## Security

Policing tables:

- use organisation-scoped Row Level Security
- require the organisation to hold the Policing entitlement
- attach the existing RecordsWeb billing write guard when installed
- prevent authenticated clients from forging `organisation_id` or `created_by`
- reject cross-organisation links between persons, vehicles and incidents

Existing RecordsWeb security/session/moderation controls remain in place.

## Compatibility

Existing organisations are migrated to **RecordsWeb Clinical** automatically. No existing Clinical records are moved or converted.

The existing standalone Discord bot can continue operating independently; this 5.0.0 release contains the Website/Electron platform changes rather than a replacement bot package.

## Deployment

1. Back up the Supabase database.
2. Run `supabase/recordsweb-5.0.0-products-policing.sql` in Supabase SQL Editor.
3. Deploy the updated Platform Admin Edge Function:

```powershell
supabase functions deploy recordsweb-platform-admin --no-verify-jwt --project-ref cdakocrmfstsknbgugkc
```

4. If you use `recordsweb-discord` to generate login cards, redeploy it so its fallback version label is 5.0.0:

```powershell
supabase functions deploy recordsweb-discord --project-ref cdakocrmfstsknbgugkc
```

5. Deploy/build the 5.0.0 Website and Electron source.
6. Open **Platform Management → Products & Testers** and configure product access for communities as required.

No new Supabase secret is required by the 5.0.0 product-entitlement migration.
