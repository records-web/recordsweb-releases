# RecordsWeb 3.1.7 — Consultation template replacement

The previous one-section-at-a-time consultation editor has been replaced with a structured clinical consultation workspace based on the supplied reference layout.

Fixed consultation sections, in order:

1. Problem
2. History
3. Examination
4. Medication
5. Comment
6. Follow Up
7. Test Requests
8. Referral
9. Document
10. Allergies

All sections remain separate within the stored consultation `entries` JSON. Existing consultations remain readable. Older `Test Request` entries are displayed as `Test Requests`; unrecognised legacy sections are preserved when an older consultation is edited.

No Supabase schema migration is required for this release.
