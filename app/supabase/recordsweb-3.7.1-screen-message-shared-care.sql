-- RecordsWeb 3.7.1
-- Shared Care staff directory and cross-organisation Screen Messages.
-- Requires the RecordsWeb 3.6.0 Shared Care Workspace migration.

create or replace function public.recordsweb_screen_message_recipient_allowed(p_recipient_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_recipient_org uuid;
begin
  if auth.uid() is null or v_org is null or p_recipient_id is null then
    return false;
  end if;

  select p.organisation_id
    into v_recipient_org
  from public.profiles p
  where p.id = p_recipient_id
    and p.active = true;

  if v_recipient_org is null then
    return false;
  end if;

  if v_recipient_org = v_org then
    return true;
  end if;

  return exists (
    select 1
    from public.recordsweb_shared_care_workspace_members mine
    join public.recordsweb_shared_care_workspace_members theirs
      on theirs.workspace_id = mine.workspace_id
    where mine.organisation_id = v_org
      and theirs.organisation_id = v_recipient_org
  );
end;
$$;

revoke all on function public.recordsweb_screen_message_recipient_allowed(uuid) from public, anon;
grant execute on function public.recordsweb_screen_message_recipient_allowed(uuid) to authenticated;

create or replace function public.recordsweb_screen_message_management_visible(
  p_source_organisation_id uuid,
  p_recipient_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organisation_id();
  v_recipient_org uuid;
begin
  if auth.uid() is null or v_org is null or not public.current_user_is_management() then
    return false;
  end if;

  if p_source_organisation_id = v_org then
    return true;
  end if;

  select p.organisation_id into v_recipient_org
  from public.profiles p
  where p.id = p_recipient_id;

  return v_recipient_org = v_org;
end;
$$;

revoke all on function public.recordsweb_screen_message_management_visible(uuid,uuid) from public, anon;
grant execute on function public.recordsweb_screen_message_management_visible(uuid,uuid) to authenticated;

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
  recipient_scope text
)
language sql
stable
security definer
set search_path = public
as $$
  with current_org as (
    select public.current_organisation_id() as id
  ),
  allowed_organisations as (
    select c.id as organisation_id
    from current_org c
    where c.id is not null

    union

    select linked.organisation_id
    from current_org c
    join public.recordsweb_shared_care_workspace_members mine
      on mine.organisation_id = c.id
    join public.recordsweb_shared_care_workspace_members linked
      on linked.workspace_id = mine.workspace_id
    where c.id is not null
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
    o.name as organisation_name,
    o.org_code as organisation_code,
    o.system_mode as organisation_mode,
    case when p.organisation_id = c.id then 'organisation' else 'shared' end as recipient_scope
  from public.profiles p
  join public.organisations o on o.id = p.organisation_id
  cross join current_org c
  where p.active = true
    and p.organisation_id in (select a.organisation_id from allowed_organisations a)
  order by
    case when p.organisation_id = c.id then 0 else 1 end,
    o.name,
    p.last_name nulls last,
    p.first_name nulls last,
    p.display_name;
$$;

revoke all on function public.recordsweb_screen_message_staff_directory() from public, anon;
grant execute on function public.recordsweb_screen_message_staff_directory() to authenticated;

-- A Screen Message is still stamped with the sender's organisation. The rules
-- below permit a recipient in the same Shared Care workspace to receive/read it
-- without granting general cross-organisation profile or record access.
drop policy if exists "screen_messages_read" on public.staff_screen_messages;
drop policy if exists "screen_messages_insert" on public.staff_screen_messages;
drop policy if exists "screen_messages_update" on public.staff_screen_messages;

create policy "screen_messages_read" on public.staff_screen_messages
for select to authenticated
using (
  recipient_id = auth.uid()
  or public.recordsweb_screen_message_management_visible(organisation_id, recipient_id)
);

create policy "screen_messages_insert" on public.staff_screen_messages
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and sender_id = auth.uid()
  and public.recordsweb_screen_message_recipient_allowed(recipient_id)
);

create policy "screen_messages_update" on public.staff_screen_messages
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());
