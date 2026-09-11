# RecordsWeb 3.3.2 — Typical Dosage & Quantity Calculator

This update extends the v3.2.8/v3.2.9 prescribing workflow without changing the database schema.

## Prescribed dosage

When a medicine from the GP MEDS catalogue contains a numeric daily regimen, RecordsWeb derives selectable typical dosage options from the supplied reference. For example, the source wording `Often 30–40 mg once daily for acute respiratory exacerbation` produces selectable `30 mg once daily` and `40 mg once daily` choices. The original reference wording remains visible alongside the derived option.

If the reference is not an exact calculable regimen, the clinician can use Custom dosage.

## Automatic tablet/capsule quantity

For tablet/capsule prescriptions, the clinician supplies the actual strength being issued and the course duration. RecordsWeb calculates:

`Dose ÷ strength per tablet × frequency per day × course duration = quantity`

Example: 40 mg once daily, 5 mg tablets, 5 days = 40 tablets.

The strength is not guessed from GP MEDS.pdf because the supplied reference lists prescribing doses rather than pack/tablet strengths.

## Custom dosage and quantity

The clinician can switch to Custom dosage and enter an authorised regimen and quantity manually. Typical regimens also have a Custom quantity option.

Automatic quantity is limited to tablet/capsule prescriptions where the selected typical dose can be parsed as an exact mass dose and daily frequency. Other forms/regimens use custom quantity rather than an unsafe inferred calculation.

## Existing safety controls

The existing 4-digit prescribing PIN, specialist-drug GP Partner authorisation, medication history, cancellation reason, re-authorisation workflow, GP MEDS source warning, and Stripe/billing controls remain unchanged.

## Database

No new SQL migration is required for 3.3.2.

## 3.3.2 frequency editing

Typical dosage remains a reference starting point, but the prescriber can now change the numeric **Frequency per day** independently. The field deliberately accepts a number only and is labelled `Frequency per day (ONLY CHANGE THE NUMBER)`.

Changing the frequency immediately changes both the saved prescribed-dose wording and the automatic quantity calculation. For example:

- Amoxicillin 500 mg
- 500 mg capsule strength
- Frequency `4`
- Course duration `7` days

calculates `500 ÷ 500 × 4 × 7 = 28 capsules`.

Course duration remains clinician-editable, so an antibiotic course is not forced to 5 or 7 days.
