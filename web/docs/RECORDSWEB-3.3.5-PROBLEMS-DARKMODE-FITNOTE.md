# RecordsWeb 3.3.5

## Problems

The Problems record now separates **Active Problems** and **Past Problems**. Each problem supports `onset_date` (Start date) and `end_date`. End date is required by the client when a problem is Past or Resolved and is cleared when moved back to Active.

Run `supabase/recordsweb-3.3.5-problem-end-dates.sql`.

## Screen Messages

Dark mode now explicitly themes the message preview pane, sender line, body copy and selected inbox row to prevent white-on-white text.

## Fit notes on the website

The browser print fallback no longer relies on an inline script. The RecordsWeb CSP blocks inline JavaScript, which prevented the previous hidden-frame print trigger from executing. The web client now loads the print document through `iframe.srcdoc` and calls `print()` from the parent application.

If an archived PDF exists it is still downloaded directly. For web-created fit notes without an archived PDF, **Save PDF** opens the browser print dialog; choose the browser's **Save to PDF** destination.
