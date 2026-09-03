# RecordsWeb 2.6.2

## Roleplay fit notes

Fit notes are generated as A4 landscape roleplay documents with a prominent ROLEPLAY ONLY marker. They contain no government links and no QR code. Print and Save PDF continue to use Electron-native PDF/print handling.

## Prescribing PIN

Every medication create or edit requires the signed-in user to enter a four-digit prescribing PIN. Users create/change their own PIN in Account & Security, or create it on first prescribing use. Supabase stores only a bcrypt-style pgcrypto hash. Medication writes are routed through `recordsweb_save_medication` so direct authenticated table writes cannot bypass the PIN.

Run `supabase/recordsweb-2.6.2.sql` before testing the feature against Supabase.
