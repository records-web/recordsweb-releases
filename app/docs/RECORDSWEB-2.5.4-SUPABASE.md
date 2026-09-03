# RecordsWeb 2.5.4 Supabase change

RecordsWeb 2.5.4 uses the active staff directory for both Screen Messages and the searchable appointment clinician picker.

Run the full `supabase/schema.sql`, or apply this policy change in the Supabase SQL Editor:

```sql
drop policy if exists "profile_read" on public.profiles;
create policy "profile_read" on public.profiles for select
using (
  id = auth.uid()
  or (
    organisation_id = public.current_organisation_id()
    and (active = true or public.current_user_is_management())
  )
);
```

This lets authenticated active Grove Way staff see active colleagues in the same organisation. Management users can still see inactive accounts for account administration.

No service-role key belongs in the Electron `.env`.
