-- RecordsWeb 3.7.2 — public automated status health checks
-- Adds a minimal anonymous-safe Shared Care health probe used by /api/status.
-- No patient, staff, organisation or workspace details are returned.

create or replace function public.recordsweb_public_shared_care_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Touch the core Shared Care workspace tables so this reports healthy only
  -- when the 3.6.0 Shared Care schema is present and queryable.
  perform 1 from public.recordsweb_shared_care_links limit 1;
  perform 1 from public.recordsweb_shared_care_workspaces limit 1;
  perform 1 from public.recordsweb_shared_care_workspace_members limit 1;
  perform 1 from public.recordsweb_shared_care_patient_threads limit 1;

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false);
end;
$$;

revoke all on function public.recordsweb_public_shared_care_health() from public;
grant execute on function public.recordsweb_public_shared_care_health() to anon, authenticated;
