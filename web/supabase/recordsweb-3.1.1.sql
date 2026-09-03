-- RecordsWeb 3.1.1 - maintenance mode hotfix.
-- Fixes PostgreSQL ambiguity in recordsweb_set_maintenance caused by the
-- RETURNS TABLE output column named organisation_code matching the UPSERT key.
-- Safe to run after recordsweb-3.1.0.sql.

create or replace function public.recordsweb_set_maintenance(
  p_enabled boolean,
  p_message text default null,
  p_estimated_end_at timestamptz default null
)
returns table (
  organisation_code text,
  enabled boolean,
  message text,
  estimated_end_at timestamptz,
  enabled_at timestamptz,
  enabled_by_name text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_org public.organisations%rowtype;
  v_message text;
  v_previous_enabled boolean;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;

  select * into v_profile
  from public.profiles p
  where p.id = auth.uid() and p.active = true and p.is_management = true;

  if not found then raise exception 'Management permission is required.'; end if;

  select * into v_org
  from public.organisations o
  where o.id = v_profile.organisation_id;

  if not found then raise exception 'The RecordsWeb organisation could not be verified.'; end if;

  select m.enabled
  into v_previous_enabled
  from public.system_maintenance m
  where m.organisation_code = v_org.org_code;

  v_message := left(trim(coalesce(p_message, '')), 500);
  if v_message = '' then
    v_message := 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.';
  end if;

  insert into public.system_maintenance as sm (
    organisation_code, organisation_id, enabled, message, estimated_end_at,
    enabled_at, enabled_by, enabled_by_name, updated_at
  ) values (
    v_org.org_code, v_org.id, coalesce(p_enabled, false), v_message, p_estimated_end_at,
    case when coalesce(p_enabled, false) then now() else null end,
    auth.uid(), coalesce(v_profile.display_name, v_profile.username, 'Management'), now()
  )
  on conflict on constraint system_maintenance_pkey do update set
    organisation_id = excluded.organisation_id,
    enabled = excluded.enabled,
    message = excluded.message,
    estimated_end_at = excluded.estimated_end_at,
    enabled_at = case when excluded.enabled then now() else null end,
    enabled_by = excluded.enabled_by,
    enabled_by_name = excluded.enabled_by_name,
    updated_at = now();

  if to_regclass('public.audit_log') is not null then
    insert into public.audit_log (
      organisation_id, actor_id, actor_name, actor_role,
      action, entity_type, description, metadata
    ) values (
      v_profile.organisation_id,
      auth.uid(),
      v_profile.display_name,
      v_profile.role,
      case
        when v_previous_enabled is distinct from coalesce(p_enabled, false) and coalesce(p_enabled, false) then 'system.maintenance.enabled'
        when v_previous_enabled is distinct from coalesce(p_enabled, false) and not coalesce(p_enabled, false) then 'system.maintenance.disabled'
        else 'system.maintenance.details.updated'
      end,
      'system_maintenance',
      case
        when v_previous_enabled is distinct from coalesce(p_enabled, false) and coalesce(p_enabled, false) then 'Enabled RecordsWeb maintenance mode.'
        when v_previous_enabled is distinct from coalesce(p_enabled, false) and not coalesce(p_enabled, false) then 'Disabled RecordsWeb maintenance mode.'
        else 'Updated RecordsWeb maintenance details.'
      end,
      jsonb_build_object('message', v_message, 'estimated_end_at', p_estimated_end_at)
    );
  end if;

  return query
  select m.organisation_code, m.enabled, m.message, m.estimated_end_at,
         m.enabled_at, m.enabled_by_name, m.updated_at
  from public.system_maintenance m
  where m.organisation_code = v_org.org_code;
end;
$$;

grant execute on function public.recordsweb_set_maintenance(boolean, text, timestamptz) to authenticated;
revoke execute on function public.recordsweb_set_maintenance(boolean, text, timestamptz) from anon;
