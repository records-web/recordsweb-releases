# RecordsWeb 2.6.3 — Fit note one-page PDF fix

- The roleplay fit note is constrained to one A4 landscape page.
- PDF rendering now relies on CSS page sizing with zero additional Electron margins, avoiding compounded margins and accidental second pages.
- The fit-note content was compacted while retaining the two-column layout and roleplay markings.
- The document footer now sits in the page grid instead of extending the left column beyond the printable area.
- Native printing requests A4 landscape with no extra Electron margins.
- The existing 120-second mandatory update workflow and prescribing PIN flow are unchanged.
