# RecordsWeb 3.1.3 - Staff sessions and profile activity

Management Staff Accounts now shows whether each staff account is currently signed in, the most recent RecordsWeb session, and a clickable staff profile. The profile dialog provides account information, recent session history and staff-specific audit events.

Run `supabase/recordsweb-3.1.3.sql` once before using session visibility. Session state uses a 30-second heartbeat and is treated as signed out after roughly 90 seconds without a heartbeat, which also handles unexpected application closure.
