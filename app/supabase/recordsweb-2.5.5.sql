-- RecordsWeb 2.5.5 management screen-message audit access.
-- Safe to run after the main RecordsWeb schema has already been installed.
-- Management users may read all staff-to-staff screen messages for their own
-- organisation. Normal staff may still only read messages addressed to them.

drop policy if exists "screen_messages_read" on public.staff_screen_messages;
create policy "screen_messages_read" on public.staff_screen_messages for select to authenticated
using (
  organisation_id = public.current_organisation_id()
  and (recipient_id = auth.uid() or public.current_user_is_management())
);
