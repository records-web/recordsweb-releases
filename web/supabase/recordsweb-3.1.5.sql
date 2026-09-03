-- RecordsWeb 3.1.5 - immutable signed fit notes / PDF document view support.
-- Run after the existing RecordsWeb schema. Safe to re-run.

alter table public.documents add column if not exists immutable boolean not null default false;
alter table public.documents add column if not exists locked_at timestamptz;
alter table public.documents add column if not exists locked_by uuid references public.profiles(id) on delete set null;

-- Existing issued fit notes become immutable immediately.
update public.documents
set immutable = true,
    locked_at = coalesce(locked_at, created_at, now()),
    status = 'Signed'
where (document_type = 'Fit Note' or category = 'Fit Note')
  and immutable = false;

create or replace function public.recordsweb_prevent_locked_document_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.immutable then
      raise exception 'Signed fit notes cannot be deleted or edited.' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.immutable then
    -- Permit only the one-time attachment of an archived PDF to a locked legacy
    -- fit note. No clinical/document content may change at the same time.
    if old.storage_path is null
       and new.storage_path is not null
       and new.id is not distinct from old.id
       and new.patient_id is not distinct from old.patient_id
       and new.title is not distinct from old.title
       and new.category is not distinct from old.category
       and new.date is not distinct from old.date
       and new.author is not distinct from old.author
       and new.document_type is not distinct from old.document_type
       and new.status is not distinct from old.status
       and new.details is not distinct from old.details
       and new.immutable is not distinct from old.immutable
       and new.locked_at is not distinct from old.locked_at
       and new.locked_by is not distinct from old.locked_by
    then
      return new;
    end if;

    raise exception 'Signed fit notes cannot be edited.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists recordsweb_locked_document_guard on public.documents;
create trigger recordsweb_locked_document_guard
before update or delete on public.documents
for each row execute function public.recordsweb_prevent_locked_document_change();

create or replace function public.recordsweb_lock_fit_note(p_document_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select d.* into v_document
  from public.documents d
  join public.patients p on p.id = d.patient_id
  where d.id = p_document_id
    and p.organisation_id = public.current_organisation_id()
    and (d.document_type = 'Fit Note' or d.category = 'Fit Note');

  if not found then
    raise exception 'Fit note not found.';
  end if;

  if v_document.immutable then
    return v_document;
  end if;

  update public.documents
  set immutable = true,
      locked_at = now(),
      locked_by = auth.uid(),
      status = 'Signed'
  where id = p_document_id
  returning * into v_document;

  return v_document;
end;
$$;

grant execute on function public.recordsweb_lock_fit_note(uuid) to authenticated;
