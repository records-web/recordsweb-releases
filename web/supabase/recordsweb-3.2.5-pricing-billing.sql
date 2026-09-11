-- RecordsWeb 3.2.5 — public pricing and organisation billing state
-- Adds manual billing metadata used by Platform Management and the organisation Management screen.
-- This migration does not process payments or automatically suspend organisations.

begin;

alter table public.organisations add column if not exists billing_plan text not null default 'standard';
alter table public.organisations add column if not exists billing_status text not null default 'active';
alter table public.organisations add column if not exists billing_monthly_price numeric(8,2) not null default 9.50;
alter table public.organisations add column if not exists billing_first_month_price numeric(8,2) not null default 5.00;
alter table public.organisations add column if not exists billing_first_month_offer boolean not null default false;
alter table public.organisations add column if not exists billing_setup_fee numeric(8,2) not null default 7.00;
alter table public.organisations add column if not exists billing_start_date date;
alter table public.organisations add column if not exists billing_next_date date;
alter table public.organisations add column if not exists announcement_board_enabled boolean not null default false;
alter table public.organisations add column if not exists announcement_board_fee numeric(8,2) not null default 10.00;
alter table public.organisations add column if not exists billing_notes text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_billing_status_allowed') then
    alter table public.organisations add constraint organisations_billing_status_allowed
      check (billing_status in ('setup','active','overdue','suspended','complimentary'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisations_billing_plan_allowed') then
    alter table public.organisations add constraint organisations_billing_plan_allowed
      check (billing_plan in ('standard'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisations_billing_amounts_nonnegative') then
    alter table public.organisations add constraint organisations_billing_amounts_nonnegative
      check (
        billing_monthly_price >= 0 and billing_monthly_price < 10000 and
        billing_first_month_price >= 0 and billing_first_month_price < 10000 and
        billing_setup_fee >= 0 and billing_setup_fee < 10000 and
        announcement_board_fee >= 0 and announcement_board_fee < 10000
      );
  end if;
end $$;


-- Billing fields are controlled by RecordsWeb Platform Management. Community
-- managers can still update branding on their organisation row, but cannot
-- alter their own subscription or pricing through the client API.
create or replace function public.recordsweb_protect_organisation_billing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'RecordsWeb billing fields can only be changed by Platform Management.' using errcode = '42501';
  end if;
  return new;
end;
$$;

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
  billing_notes
on public.organisations
for each row
execute function public.recordsweb_protect_organisation_billing();

-- Recreate the operator list with billing fields. PostgreSQL requires the old
-- function to be dropped when the return table definition changes.
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
  billing_notes text
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
    o.billing_notes
  from public.organisations o
  order by lower(o.name), o.org_code;
end;
$$;

revoke all on function public.recordsweb_operator_list_organisations() from public;
grant execute on function public.recordsweb_operator_list_organisations() to authenticated;

commit;
