-- RecordsWeb 3.2.7 — billing grace period and read-only suspension
-- Run after recordsweb-3.2.6-stripe-billing.sql.
-- Failed subscription payments receive a 7-day grace period. After the grace
-- period, the organisation remains readable but writes are blocked until
-- billing is restored or Platform Management exempts the community from payment.

begin;

alter table public.organisations add column if not exists billing_grace_started_at timestamptz;
alter table public.organisations add column if not exists billing_grace_ends_at timestamptz;
alter table public.organisations add column if not exists billing_read_only_since timestamptz;

-- Existing overdue communities receive a fresh 7-day grace period when this
-- migration is installed, using the most recent Stripe update when available.
update public.organisations
set
  billing_grace_started_at = coalesce(billing_grace_started_at, stripe_updated_at, now()),
  billing_grace_ends_at = coalesce(billing_grace_ends_at, coalesce(stripe_updated_at, now()) + interval '7 days'),
  billing_read_only_since = null
where billing_status = 'overdue'
  and coalesce(billing_payment_exempt, false) = false;

-- Payment-exempt/complimentary organisations are never restricted.
update public.organisations
set
  billing_grace_started_at = null,
  billing_grace_ends_at = null,
  billing_read_only_since = null
where coalesce(billing_payment_exempt, false) = true
   or billing_status = 'complimentary';

-- Community users must not be able to spoof grace or suspension state.
drop trigger if exists recordsweb_protect_organisation_billing_fields on public.organisations;
create trigger recordsweb_protect_organisation_billing_fields
before update of
  billing_plan,
  billing_status,
  billing_monthly_price,
  billing_first_month_price,
  billing_first_month_offer,
  billing_setup_fee,
  billing_start_date,
  billing_next_date,
  announcement_board_enabled,
  announcement_board_fee,
  billing_notes,
  billing_payment_exempt,
  billing_exemption_reason,
  billing_email,
  billing_setup_fee_paid_at,
  billing_first_month_offer_redeemed_at,
  announcement_board_paid_at,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_subscription_status,
  stripe_last_invoice_status,
  stripe_checkout_session_id,
  stripe_current_period_end,
  stripe_last_payment_at,
  stripe_environment,
  stripe_updated_at,
  billing_grace_started_at,
  billing_grace_ends_at,
  billing_read_only_since
on public.organisations
for each row
execute function public.recordsweb_protect_organisation_billing();

-- Returns true when the signed-in organisation may change RecordsWeb data.
-- Reads remain available regardless of the result.
create or replace function public.recordsweb_billing_write_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      case
        when coalesce(o.billing_payment_exempt, false) then true
        when o.billing_status = 'complimentary' then true
        when o.billing_status = 'suspended' then false
        when o.billing_status = 'overdue'
          and o.billing_grace_ends_at is not null
          and now() >= o.billing_grace_ends_at then false
        else true
      end
    from public.organisations o
    where o.id = public.current_organisation_id()
  ), false);
$$;

revoke all on function public.recordsweb_billing_write_allowed() from public;
grant execute on function public.recordsweb_billing_write_allowed() to authenticated;

-- Refreshes the current organisation's stored billing status when its grace
-- period has elapsed. This is safe for the client to call because it can only
-- act on current_organisation_id().
create or replace function public.recordsweb_refresh_billing_access_state()
returns table (
  access_mode text,
  billing_status text,
  billing_payment_exempt boolean,
  billing_grace_started_at timestamptz,
  billing_grace_ends_at timestamptz,
  billing_read_only_since timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  v_org_id := public.current_organisation_id();
  if v_org_id is null then
    raise exception 'Unable to determine the current RecordsWeb organisation.' using errcode = '42501';
  end if;

  update public.organisations o
  set
    billing_status = 'suspended',
    billing_read_only_since = coalesce(o.billing_read_only_since, now()),
    stripe_updated_at = coalesce(o.stripe_updated_at, now())
  where o.id = v_org_id
    and coalesce(o.billing_payment_exempt, false) = false
    and o.billing_status = 'overdue'
    and o.billing_grace_ends_at is not null
    and now() >= o.billing_grace_ends_at;

  return query
  select
    case
      when coalesce(o.billing_payment_exempt, false) or o.billing_status = 'complimentary' then 'exempt'
      when o.billing_status = 'suspended' then 'read_only'
      when o.billing_status = 'overdue'
        and o.billing_grace_ends_at is not null
        and now() >= o.billing_grace_ends_at then 'read_only'
      when o.billing_status = 'overdue' then 'grace'
      else 'full'
    end as access_mode,
    o.billing_status,
    o.billing_payment_exempt,
    o.billing_grace_started_at,
    o.billing_grace_ends_at,
    o.billing_read_only_since
  from public.organisations o
  where o.id = v_org_id;
end;
$$;

revoke all on function public.recordsweb_refresh_billing_access_state() from public;
grant execute on function public.recordsweb_refresh_billing_access_state() to authenticated;

-- Database-side enforcement. Service-role/platform writes bypass this; signed-in
-- community users are blocked from INSERT/UPDATE/DELETE after the grace period.
create or replace function public.recordsweb_enforce_billing_write_access()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if not public.recordsweb_billing_write_allowed() then
    raise exception 'RecordsWeb is in read-only mode because the organisation subscription is suspended or its 7-day payment grace period has ended. Update billing to restore write access.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Apply the read-only guard to RecordsWeb data that represents clinical,
-- operational, staff-content or organisation configuration changes. Audit,
-- login/session tracking and message-read receipts remain writable.
do $$
declare
  t text;
begin
  foreach t in array array[
    'organisations',
    'patients',
    'problems',
    'medications',
    'consultations',
    'diary_tasks',
    'documents',
    'investigations',
    'referrals',
    'appointments',
    'staff_reports',
    'staff_jobs',
    'staff_notices',
    'organisation_notepad',
    'organisation_news',
    'fit_note_pdfs',
    'patient_alerts',
    'document_versions',
    'deleted_records'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists recordsweb_billing_write_guard on public.%I', t);
      execute format(
        'create trigger recordsweb_billing_write_guard before insert or update or delete on public.%I for each row execute function public.recordsweb_enforce_billing_write_access()',
        t
      );
    end if;
  end loop;
end $$;

-- Storage remains readable, but branding and clinical-document writes are also
-- denied after the grace period. Recreate only the existing multi-organisation
-- write policies; select/read policies are intentionally unchanged.
drop policy if exists "recordsweb_branding_management_insert" on storage.objects;
drop policy if exists "recordsweb_branding_management_update" on storage.objects;
drop policy if exists "recordsweb_branding_management_delete" on storage.objects;

create policy "recordsweb_branding_management_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and public.recordsweb_billing_write_allowed()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create policy "recordsweb_branding_management_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and public.recordsweb_billing_write_allowed()
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
)
with check (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and public.recordsweb_billing_write_allowed()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
);

create policy "recordsweb_branding_management_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-branding'
  and public.current_user_is_management()
  and public.recordsweb_billing_write_allowed()
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
);

drop policy if exists "recordsweb_documents_insert" on storage.objects;
drop policy if exists "recordsweb_documents_update" on storage.objects;
drop policy if exists "recordsweb_documents_delete" on storage.objects;

create policy "recordsweb_documents_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordsweb-documents'
  and public.recordsweb_billing_write_allowed()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and public.recordsweb_billing_write_allowed()
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
)
with check (
  bucket_id = 'recordsweb-documents'
  and public.recordsweb_billing_write_allowed()
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

create policy "recordsweb_documents_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recordsweb-documents'
  and public.recordsweb_billing_write_allowed()
  and (
    (storage.foldername(name))[1] = public.current_organisation_id()::text
    or (
      (storage.foldername(name))[1] = 'grove-way-health-centre'
      and public.current_organisation_code() = 'GW.HC'
    )
  )
  and exists (
    select 1 from public.patients p
    where p.id::text = (storage.foldername(name))[2]
      and p.organisation_id = public.current_organisation_id()
  )
);

commit;
