# RecordsWeb 3.3.4 — Community-scoped Roblox RP patient identities

RecordsWeb can now persist a Roblox player's roleplay patient identity **inside one RecordsWeb community**.

The same Roblox account can therefore be a different roleplay patient in different communities:

```text
Roblox UserId 12345678

@GW.HC  -> Oliver Harris -> one RecordsWeb patient record
@UH.SL  -> Ethan Carter  -> a separate RecordsWeb patient record
```

RecordsWeb does **not** automatically match, merge or expose the patient's record across communities.

## Database model

Run:

```text
supabase/recordsweb-3.3.4-roblox-patient-identities.sql
```

This adds:

- `recordsweb_roblox_integrations.patient_identity_enabled`
- `recordsweb_roblox_patient_identities`
- a unique `(organisation_id, roblox_user_id)` mapping
- a patient/community consistency trigger
- server-only table permissions

The linked `patients` row is the canonical roleplay identity. The Roblox identity table only stores the Roblox-to-patient link and last-seen metadata.

## Game API endpoint

Preferred public endpoint:

```text
https://api.recordsweb.org
```

The Worker can continue proxying internally to the Supabase `recordsweb-game-api` Edge Function.

All Roblox requests remain server-to-server and use the existing secret header:

```text
x-recordsweb-key: rw_live_...
```

Never place the connection code in a LocalScript or ReplicatedStorage.

## API actions

Every action also supplies:

```json
{
  "universeId": "123456789",
  "placeId": "987654321",
  "serverId": "Roblox JobId"
}
```

### `identity-get`

Checks whether the Roblox user already has a patient identity in the current RecordsWeb community.

```json
{
  "action": "identity-get",
  "robloxUserId": "12345678",
  "robloxUsername": "ExamplePlayer",
  "robloxDisplayName": "Example Player"
}
```

When no identity exists:

```json
{
  "ok": true,
  "identityScope": "community",
  "needsRegistration": true,
  "identity": null
}
```

### `identity-register`

Creates the community's patient record and links it to the Roblox UserId.

```json
{
  "action": "identity-register",
  "robloxUserId": "12345678",
  "robloxUsername": "ExamplePlayer",
  "roleplay": {
    "firstName": "Oliver",
    "lastName": "Harris",
    "dob": "1998-06-14",
    "sex": "Male"
  }
}
```

The request is idempotent: if the community already has an identity for that Roblox user, RecordsWeb returns the established identity instead of creating another one.

### `identity-resolve`

Recommended join flow. If an identity exists, it is returned. If it does not exist and no roleplay demographics were supplied, `needsRegistration` is returned. If demographics are supplied, RecordsWeb registers the new identity.

### `identity-update`

Updates the linked **local community patient**. It never changes another community's identity for the same Roblox account.

## Join flow

```text
Player joins
    |
    v
identity-resolve
    |
    +-- existing identity --> load same RP patient
    |
    +-- needsRegistration --> game shows RP character form
                               |
                               v
                         identity-register
                               |
                               v
                        patient record created
```

The returned identity can be cached on the Player as attributes for that server session, but Supabase remains the persistent source of truth.

## Billing behaviour

- Identity lookup continues to work when an organisation is read-only.
- Creating or changing a roleplay patient is rejected once the community is billing-suspended/read-only.
- Complimentary/payment-exempt communities remain fully enabled.

## Management

`Management -> Roblox integration` now includes **Persistent RP patient identities** and displays the number of linked Roblox identities for that community.

The feature can be disabled per community without deleting existing mappings.

## Deployment

```powershell
supabase functions deploy recordsweb-roblox-admin --project-ref cdakocrmfstsknbgugkc
supabase functions deploy recordsweb-game-api --no-verify-jwt --project-ref cdakocrmfstsknbgugkc
```

`recordsweb-game-api` must remain `--no-verify-jwt` because Roblox authenticates with the per-community `x-recordsweb-key`, not a Supabase user JWT.
