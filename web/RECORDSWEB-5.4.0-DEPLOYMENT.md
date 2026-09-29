# RecordsWeb 5.4.0 — Ro-School Deployment

## 1. Database migration

Run the following migration in Supabase after the existing RecordsWeb migrations:

```text
supabase/recordsweb-5.4.0-ro-school.sql
```

It adds:

- `school` as an organisation system mode and RecordsWeb product
- school staff roles
- `school_pupils`
- `school_classes`
- `school_class_members`
- `school_registers`
- `school_register_marks`
- `school_timetable_entries`
- organisation-scoped RLS policies for all Ro-School data
- School / Education support in the public access-request RPC
- School / Education support in the service-role organisation provisioning RPC

## 2. Edge Functions

Redeploy the updated functions:

```text
recordsweb-platform-admin
recordsweb-admin
```

`recordsweb-platform-admin` creates and manages School / Education communities and Ro-School product entitlements. `recordsweb-admin` understands the Ro-School staff-role set when staff accounts are created or edited.

## 3. Website

Deploy the RecordsWeb 5.4.0 Website source to the existing Vercel project.

No Cloudflare Worker or DNS change is required. Existing community routing continues to use:

```text
XX.XX → xx-xx.recordsweb.org
```

For example:

```text
SC.H1 → https://sc-h1.recordsweb.org
```

The bare organisation hostname remains the sign-in page. After authentication the Ro-School workspace is available at `/#/school` and its child routes.

## 4. Electron

Install/build the 5.4.0 Electron source as normal. The desktop client uses the same organisation/product entitlement and school-role model as the Website.

## 5. Create a Ro-School community

In Platform Management:

1. Create a new community.
2. Select **School / Education (Ro-School)** as the organisation type.
3. Keep **Ro-School** as the package.
4. Set the default location to the school/site name if required.
5. Set the reserved operator password and create the community.

RecordsWeb allocates the normal unique `XX.XX` code automatically. The reserved operator for a Ro-School-only community is created with the **Headteacher** role.

## 6. Verify

Confirm that:

- the community portal loads at its `xx-xx.recordsweb.org` hostname
- the staff login succeeds
- the Ro-School dashboard appears after sign-in
- a pupil can be created
- a class can be created and pupils assigned
- an AM/PM register can be saved and completed
- a lesson register can be opened from a class
- attendance analysis reflects completed registers
- timetable entries can be created and removed

## Cloudflare

The RecordsWeb 5.3.1 wildcard Worker configuration remains valid. No Worker code update is required specifically for Ro-School because School / Education communities use the same `XX.XX` organisation hostname format.
