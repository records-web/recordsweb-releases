# RecordsWeb 5.2.0 — Policing record workspaces & Dispatch CAD

RecordsWeb 5.2.0 expands the Policing product from register/list views into full operational record workspaces.

## Record pages

Every Policing record can now be opened in a separate browser/Electron tab from its register:

- Persons
- Vehicles
- Incidents
- Fixed Penalty Notices
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
- Dispatch

Each detail page shows the complete record, links to related person/vehicle/incident records, timestamps and operational updates.

## Editing & deletion

Record workspaces support in-place editing and permanent deletion. Deletion requires two confirmations and is written to the existing RecordsWeb audit trail. Existing cross-record foreign keys continue to use `ON DELETE SET NULL`, so deleting one operational record does not silently delete unrelated records.

## Operational update log

The new `police_record_updates` table provides an organisation-isolated, append-only chronological update feed. Users can add notes, unit updates, status changes, location updates, on-scene entries and clear/disposal entries. The staff identity is resolved server-side by the database trigger where possible.

## Dispatch / CAD

Dispatch now has a CAD-style call workspace with:

- call reference and live status
- call type
- grade / response priority
- caller and contact
- location
- assigned units / callsigns
- radio channel
- linked person, vehicle and incident
- initial CAD notes
- outcome / disposal
- chronological CAD event log
- optional status changes from event-log entries

The layout is inspired by common dispatch/CAD workflows but remains a RecordsWeb interface rather than a copy of a third-party CAD product.

## Required database migration

Run:

`supabase/recordsweb-5.2.0-policing-record-details.sql`

No Edge Function redeployment or new secret is required for this release.
