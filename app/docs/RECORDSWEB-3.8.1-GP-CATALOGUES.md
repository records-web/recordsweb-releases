# RecordsWeb 3.8.1 — GP catalogue expansion

This release extends the existing client-side RecordsWeb reference catalogues using the two supplied UK GP PDFs.

- 500 medication entries were appended exactly as separate catalogue entries, including entries that overlap with the previous catalogue.
- 499 condition/presentation entries were appended exactly as separate catalogue entries. The supplied conditions PDF is titled as a 500-item list but contains numbered entries 1 through 499, so RecordsWeb does not invent a missing item 500.
- Medication dose/frequency wording is retained from the supplied educational reference. It is not treated as an authoritative prescribing instruction.
- The conditions source does not classify severity/significance, so imported entries are labelled `Unclassified` and do not automatically assign a clinical significance in consultation creation.
- Existing catalogue entries are retained.
- No Supabase schema migration is required because both catalogues are bundled client-side.
