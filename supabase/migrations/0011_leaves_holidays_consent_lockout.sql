-- 0011 — Leave & public holidays, biometric consent record, PIN lockout.

-- 1) Leaves ---------------------------------------------------------------
-- A leave covers [start_date, end_date] inclusive. `paid` decides whether those
-- days are credited as paid days in the payroll report (see src/lib/payroll.js).
create table if not exists leaves (
  id uuid primary key default gen_random_uuid(),
  employee_user_id uuid not null references auth.users(id) on delete cascade,
  employee_name text,
  start_date date not null,
  end_date date not null,
  type text not null default 'annual' check (type in ('annual','sick','excuse','unpaid')),
  paid boolean not null default true,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_leaves_user on leaves(employee_user_id);
create index if not exists idx_leaves_range on leaves(start_date, end_date);
alter table leaves enable row level security;

create policy leaves_select on leaves for select
  using (is_manager() or employee_user_id = auth.uid());
create policy leaves_write_manager on leaves for all
  using (is_manager()) with check (is_manager());

-- 2) Public holidays ----------------------------------------------------------
create table if not exists holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  paid boolean not null default true,
  created_at timestamptz not null default now()
);
alter table holidays enable row level security;

create policy holidays_select on holidays for select using (auth.uid() is not null);
create policy holidays_write_manager on holidays for all
  using (is_manager()) with check (is_manager());

-- 3) Biometric consent -----------------------------------------------------------
-- When a manager enrols a face they must confirm the worker's written consent;
-- the moment is recorded here. Workers can't edit it (guard below).
alter table employees add column if not exists face_consent_at timestamptz;
alter table employees add column if not exists face_consent_by uuid references auth.users(id) on delete set null;

create or replace function enforce_employee_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_manager() or auth.role() = 'service_role' then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.daily_wage is distinct from old.daily_wage
     or new.overtime_rate is distinct from old.overtime_rate
     or new.wage_type is distinct from old.wage_type
     or new.monthly_salary is distinct from old.monthly_salary
     or new.active is distinct from old.active
     or new.deleted is distinct from old.deleted
     or new.department is distinct from old.department
     or new.job_title is distinct from old.job_title
     or new.full_name is distinct from old.full_name
     or new.name is distinct from old.name
     or new.handle is distinct from old.handle
     or new.user_id is distinct from old.user_id
     or new.face_descriptors is distinct from old.face_descriptors
     or new.face_consent_at is distinct from old.face_consent_at
     or new.face_consent_by is distinct from old.face_consent_by
  then
    raise exception 'غير مسموح بتعديل هذا الحقل';
  end if;
  return new;
end;
$$;
revoke execute on function enforce_employee_self_update() from public, anon, authenticated;

-- Retention: when an employee is deleted, their biometric data goes with them.
create or replace function wipe_face_data_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted and not old.deleted then
    new.face_descriptors := null;
    new.reference_photo := null;
    new.face_consent_at := null;
    new.face_consent_by := null;
  end if;
  return new;
end;
$$;
revoke execute on function wipe_face_data_on_delete() from public, anon, authenticated;
drop trigger if exists trg_wipe_face_data_on_delete on employees;
create trigger trg_wipe_face_data_on_delete
  before update on employees
  for each row execute function wipe_face_data_on_delete();

-- 4) PIN lockout ----------------------------------------------------------------
-- Written only by the `pin-login` Edge Function (service role). RLS is enabled
-- with no policies, so no client can read or write it.
create table if not exists login_attempts (
  handle text primary key,
  failed integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table login_attempts enable row level security;
