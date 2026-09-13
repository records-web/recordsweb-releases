# RecordsWeb 3.7.0 — Classic and Modern interfaces

RecordsWeb 3.7.0 introduces a per-user interface presentation layer. The existing dense RecordsWeb interface is now called **Classic** and remains the platform/community default unless management changes it. Staff can switch to **Modern** without changing clinical data, workflows, permissions, care-setting behaviour or the login experience.

## User settings

Settings → Interface style now offers:

- **Organisation default** — follows the community default.
- **Classic** — the established compact RecordsWeb interface.
- **Modern** — the same workflows presented with updated spacing, rounded panels, clearer hierarchy, larger controls and care-setting-aware cards.

Colour mode is independent and supports **System**, **Light** and **Dark**. Workspace density is also independent and supports **Compact**, **Standard** and **Comfortable**.

User choices are scoped to the signed-in RecordsWeb user and organisation on the current browser/workstation. Existing v1 local settings are migrated on first use.

## Community default

Management → Community branding now includes **Default staff interface**. Management can choose Classic or Modern for that organisation. Staff using “Organisation default” inherit the choice, while explicit personal Classic/Modern selections remain authoritative.

## Care-setting behaviour

The style preference does not change which care workspace is loaded:

- Primary Care keeps the existing patient-first workflow.
- Hospital keeps its episode/ward/admission workflow.
- Ambulance/PHEM keeps its incident/ePCR/handover workflow.
- Shared Care Workspaces keep their network discussion, timeline, work queue and handover workflows.

Modern presentation has additional styling for each of these areas, but the underlying clinical functionality is identical to Classic.

## Login

The RecordsWeb login UI is not modernised by the Classic/Modern setting. Community care type also does not change the login layout.

## Database migration

Run:

```text
supabase/recordsweb-3.7.0-interface-style.sql
```

This adds `organisations.default_interface_style` and extends `recordsweb_public_organisation_config` so clients can load the organisation default before applying the signed-in staff workspace style.
