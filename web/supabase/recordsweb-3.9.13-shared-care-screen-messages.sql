-- RecordsWeb 3.9.13 - Shared Care screen message recipients
-- Allows staff to resolve and message active staff in organisations with an active Shared Care link.

create or replace function public.recordsweb_can_message_staff(p_recipient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select public.current_organisation_id() as organisation_id
  ), recipient as (
    select p.id, p.organisation_id, p.active
    from public.profiles p
    where p.id = p_recipient_id
  )
  select exists (
    select 1
    from me
    join recipient r on true
    where me.organisation_id is not null
      and r.active = true
      and (
        r.organisation_id = me.organisation_id
        or exists (
          select 1
          from public.recordsweb_shared_care_links l
          where l.status = 'active'
            and (
              (l.organisation_a_id = me.organisation_id and l.organisation_b_id = r.organisation_id)
              or
              (l.organisation_b_id = me.organisation_id and l.organisation_a_id = r.organisation_id)
            )
        )
      )
  );
$$;

grant execute on function public.recordsweb_can_message_staff(uuid) to authenticated;

create or replace function public.recordsweb_screen_message_staff_directory()
returns table (
  id uuid,
  username text,
  title text,
  first_name text,
  last_name text,
  display_name text,
  role text,
  roles text[],
  active boolean,
  organisation_id uuid,
  organisation_name text,
  organisation_code text,
  organisation_mode text,
  shared_care boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select public.current_organisation_id() as organisation_id
  )
  select
    p.id,
    p.username,
    p.title,
    p.first_name,
    p.last_name,
    p.display_name,
    p.role,
    p.roles,
    p.active,
    p.organisation_id,
    o.name,
    o.org_code,
    o.system_mode,
    p.organisation_id <> me.organisation_id as shared_care
  from public.profiles p
  join public.organisations o on o.id = p.organisation_id
  cross join me
  where me.organisation_id is not null
    and p.active = true
    and (
      p.organisation_id = me.organisation_id
      or exists (
        select 1
        from public.recordsweb_shared_care_links l
        where l.status = 'active'
          and (
            (l.organisation_a_id = me.organisation_id and l.organisation_b_id = p.organisation_id)
            or
            (l.organisation_b_id = me.organisation_id and l.organisation_a_id = p.organisation_id)
          )
      )
    )
  order by o.name, p.last_name nulls last, p.first_name nulls last, p.display_name;
$$;

grant execute on function public.recordsweb_screen_message_staff_directory() to authenticated;

-- A recipient must be able to read/update a cross-community message addressed to them.
drop policy if exists "screen_messages_read" on public.staff_screen_messages;
create policy "screen_messages_read" on public.staff_screen_messages for select to authenticated
using (
  recipient_id = auth.uid()
  or (
    organisation_id = public.current_organisation_id()
    and public.current_user_is_management()
  )
);

drop policy if exists "screen_messages_insert" on public.staff_screen_messages;
create policy "screen_messages_insert" on public.staff_screen_messages for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and sender_id = auth.uid()
  and public.recordsweb_can_message_staff(recipient_id)
);

drop policy if exists "screen_messages_update" on public.staff_screen_messages;
create policy "screen_messages_update" on public.staff_screen_messages for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());
