-- RecordsWeb 3.1.2 - Management account controls.
-- Adds Management-only disable reasons and application-level forced logout support.
-- Safe to re-run after the existing RecordsWeb schema/migrations.

alter table public.profiles
  add column if not exists disabled_reason text,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references public.profiles(id) on delete set null,
  add column if not exists force_logout_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_disabled_reason_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_disabled_reason_length
      check (disabled_reason is null or char_length(disabled_reason) <= 500);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
