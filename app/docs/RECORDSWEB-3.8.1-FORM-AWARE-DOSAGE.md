# RecordsWeb 3.8.1 — Form-aware medication dosage

The medication prescribing modal now changes its dosage workflow according to the selected medicine formulation.

## Liquids

Pure liquid, oral-solution, syrup and suspension formulations no longer show tablet/capsule strength controls.

When the supplied GP reference contains an explicit mL dose, RecordsWeb keeps that reference as a selectable typical dosage and displays it as a liquid direction, for example `Consume 15 mL twice daily`.

If the reference does not state an mL dose, RecordsWeb does not infer one. The clinician is directed to Custom dosage, whose liquid placeholder uses an mL direction such as `Consume 10 mL twice daily`. Quantity examples also use mL rather than tablets.

## Sprays

Pure spray formulations no longer show tablet/capsule strength controls.

A supplied reference containing an explicit number of sprays remains selectable as the typical dosage. If the supplied reference does not specify the number of sprays, RecordsWeb directs the clinician to Custom dosage instead of treating non-dose wording as a complete dosage.

Custom spray dosage prompts use spray-specific wording, for example `1 spray into each nostril once daily`. Quantity examples use a spray container rather than tablets.

## Tablets and capsules

The existing strength, frequency, course-duration and automatic quantity calculator remains unchanged for tablet/capsule formulations.

No database schema change is required.
