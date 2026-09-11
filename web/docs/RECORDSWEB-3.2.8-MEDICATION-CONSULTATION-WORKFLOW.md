# RecordsWeb 3.2.8 — Medication & consultation workflow

This release expands the medication workflow using the user-supplied `GP MEDS.pdf` reference and adds automatic Problems creation from consultations.

## Medication search

- Search-as-you-type medicine lookup. Typing `amox` surfaces Amoxicillin; partial names are ranked ahead of indication/form matches.
- The bundled catalogue contains all 200 rows from the core reference plus the expanded NHS England additions in the supplied PDF.
- Selecting a medicine shows its form, common indication, usual starting/usual dose and higher/maintenance reference exactly as represented in the supplied PDF dataset.
- RecordsWeb does not silently invent a dose for rows labelled product-specific, indication-specific or individualised.
- The selected usual reference can be copied into the prescribed-dose field, but the final regimen remains clinician-authorised and requires the prescribing PIN.

## Specialist medicines

A medicine is marked specialist when the supplied PDF uses specialist wording in the usual dose, higher/maintenance text, or NHS area.

RecordsWeb displays:

> This drug is only allowed to be prescribed by specialists. Please speak to your GP Partner for authorisation to prescribe this drug.

For specialist medicines, Supabase also enforces the rule server-side: the signed-in account must hold the `GP Partner` role and must provide its prescribing PIN. The UI warning cannot be bypassed by calling the medication RPC directly.

## Medication context actions

Right-click a previously prescribed medicine to access:

- **Drug history** — shows prescription/re-authorisation count and event history.
- **Cancel course** — requires a cancellation reason. The medicine is retained in past medication and in its history.
- **Re-authorise** — requires the current clinician's 4-digit prescribing PIN. It increments the prescription count, updates last issue date and reactivates a cancelled medicine. Specialist medicines still require a GP Partner.

The Current / Past toolbar action toggles cancelled courses into the medication list.

## Consultation → Problems

When a consultation is saved:

- if an existing Problem was selected, the consultation is linked to it;
- if no existing Problem was selected and text was entered in the Problem section, the first line is automatically created as an Active problem and the consultation is linked to it;
- an active problem with the same name is reused instead of creating a duplicate.

The consultation and problem operation is performed transactionally by Supabase.

## Database migration

Run after the 3.2.7 billing grace/read-only migration:

```sql
supabase/recordsweb-3.2.8-medication-consultation-workflow.sql
```

The migration adds medication reference metadata, prescription history, cancellation fields, specialist authorisation fields, medication events, secured RPCs, and consultation/problem linking.

## Source and clinical-safety note

The medicine catalogue is derived from the supplied `GP MEDS.pdf`, also bundled under `docs/reference/GP MEDS.pdf` for traceability. The PDF itself states that the doses are general adult reference examples and must be checked against current BNF, NICE/CKS, SPC/product information, renal/hepatic function, interactions, age, pregnancy status, monitoring requirements and the applicable local formulary before prescribing.
