-- RecordsWeb 3.2.6 — Stripe subscription billing and payment exemptions
-- Run after recordsweb-3.2.5-pricing-billing.sql.
-- Stripe secret keys are NOT stored in Postgres; configure them as Supabase Edge Function secrets.

begin;

alter table public.organisations add column if not exists billing_payment_exempt boolean not null default false;
alter table public.organisations add column if not exists billing_exemption_reason text;
alter table public.organisations add column if not exists billing_email text;
alter table public.organisations add column if not exists billing_setup_fee_paid_at timestamptz;
alter table public.organisations add column if not exists billing_first_month_offer_redeemed_at timestamptz;
alter table public.organisations add column if not exists announcement_board_paid_at timestamptz;
alter table public.organisations add column if not exists stripe_customer_id text;
alter table public.organisations add column if not exists stripe_subscription_id text;
alter table public.organisations add column if not exists stripe_subscription_status text;
alter table public.organisations add column if not exists stripe_last_invoice_status text;
alter table public.organisations add column if not exists stripe_checkout_session_id text;
alter table public.organisations add column if not exists stripe_current_period_end timestamptz;
alter table public.organisations add column if not exists stripe_last_payment_at timestamptz;
alter table public.organisations add column if not exists stripe_environment text;
alter table public.organisations add column if not exists stripe_updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_stripe_environment_allowed') then
    alter table public.organisations add constraint organisations_stripe_environment_allowed
      check (stripe_environment is null or stripe_environment in ('sandbox','live'));
  end if;
end $$;

create unique index if not exists organisations_stripe_customer_id_unique
  on public.organisations (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists organisations_stripe_subscription_id_unique
  on public.organisations (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Expand the existing protection trigger so community users cannot mark themselves
-- exempt, replace Stripe identifiers, or spoof payment state through the client API.
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
  stripe_updated_at
on public.organisations
for each row
execute function public.recordsweb_protect_organisation_billing();

-- Platform Management needs the exemption and Stripe state in its community list.
drop function if exists public.recordsweb_operator_list_organisations();
create function public.recordsweb_operator_list_organisations()
returns table (
  id uuid,
  org_code text,
  name text,
  system_mode text,
  default_location text,
  active boolean,
  created_at timestamptz,
  has_reserved_operator boolean,
  billing_plan text,
  billing_status text,
  billing_monthly_price numeric,
  billing_first_month_price numeric,
  billing_first_month_offer boolean,
  billing_setup_fee numeric,
  billing_start_date date,
  billing_next_date date,
  announcement_board_enabled boolean,
  announcement_board_fee numeric,
  billing_notes text,
  billing_payment_exempt boolean,
  billing_exemption_reason text,
  billing_email text,
  billing_setup_fee_paid_at timestamptz,
  billing_first_month_offer_redeemed_at timestamptz,
  announcement_board_paid_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_status text,
  stripe_last_invoice_status text,
  stripe_checkout_session_id text,
  stripe_current_period_end timestamptz,
  stripe_last_payment_at timestamptz,
  stripe_environment text,
  stripe_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.recordsweb_is_platform_operator() then
    raise exception 'Access denied: RecordsWeb platform operator permission is required.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.org_code,
    o.name,
    o.system_mode,
    o.default_location,
    o.active,
    o.created_at,
    exists (
      select 1 from public.profiles p
      where p.organisation_id = o.id
        and p.active = true
        and lower(p.username) = lower('gus.farnsworth@' || o.org_code)
    ) as has_reserved_operator,
    o.billing_plan,
    o.billing_status,
    o.billing_monthly_price,
    o.billing_first_month_price,
    o.billing_first_month_offer,
    o.billing_setup_fee,
    o.billing_start_date,
    o.billing_next_date,
    o.announcement_board_enabled,
    o.announcement_board_fee,
    o.billing_notes,
    o.billing_payment_exempt,
    o.billing_exemption_reason,
    o.billing_email,
    o.billing_setup_fee_paid_at,
    o.billing_first_month_offer_redeemed_at,
    o.announcement_board_paid_at,
    o.stripe_customer_id,
    o.stripe_subscription_id,
    o.stripe_subscription_status,
    o.stripe_last_invoice_status,
    o.stripe_checkout_session_id,
    o.stripe_current_period_end,
    o.stripe_last_payment_at,
    o.stripe_environment,
    o.stripe_updated_at
  from public.organisations o
  order by lower(o.name), o.org_code;
end;
$$;

revoke all on function public.recordsweb_operator_list_organisations() from public;
grant execute on function public.recordsweb_operator_list_organisations() to authenticated;

commit;
