# RecordsWeb 2.6.1

## Fit note PDF output

- Fit note printing now uses Electron native printing instead of a zero-size iframe.
- Save PDF uses Electron `webContents.printToPDF()` and a native Windows Save dialog.
- Issued fit note PDFs are automatically archived to the private `recordsweb-documents` Supabase Storage bucket when Supabase is configured.
- `public.fit_note_pdfs` tracks the archived PDF and links it back to the patient and `documents` record.
- Run `supabase/recordsweb-2.6.1.sql` before relying on automatic archive storage.

## Consultation entry separation

- Problem, History, Examination, Comment, Procedure, Medication, Test Request and Referral text are retained independently while composing a consultation.
- Selecting a current problem places it at the top of the consultation context and pre-fills the separate Problem section.
- Saved consultations preserve each section as an individual entry rather than merging it into one text field.
- Editing an existing consultation also preserves the individual sections.

## Updates

The mandatory in-app updater continues to use the existing 120-second countdown before starting automatically.
