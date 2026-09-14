# RecordsWeb 3.8.5

## Fixes

- Fixed dark-mode contrast in the prescribing reference and warning panel.
- Removed the numeric `borderLeft` path that caused Supabase Edge prescription image generation to fail.
- Added a safe fallback prescription renderer so a renderer-specific layout error does not prevent the prescription DM from being sent.
- Fit-note Discord delivery now uses PDF only. Existing archived PDFs are sent unchanged; if no archived PDF exists, RecordsWeb generates a PDF, archives it in `recordsweb-documents`, updates `fit_note_pdfs` / `documents.storage_path`, and sends those same PDF bytes to the patient.
- No HTML fit-note attachment fallback remains.
