# RecordsWeb 2.5.5 Supabase change

RecordsWeb 2.5.5 adds a Management-only **Screen message logs** view.

No new table or column is required. The existing `staff_screen_messages` table is used as the audit source. Run:

```sql
-- contents of supabase/recordsweb-2.5.5.sql
```

in the Supabase SQL Editor, or run the full updated `supabase/schema.sql` on a fresh project.

The RLS change allows a management account to read all screen messages belonging to Grove Way Health Centre while ordinary users can still only read messages sent to their own account. Message updates remain recipient-only, so the Management audit view is read-only.
