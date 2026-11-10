-- 0009 — Shared kiosk device + face identification.
--
-- A single "kiosk" account (one tablet/phone at the site gate) recognises
-- each worker by face and records their attendance. This adds:
--   * role 'kiosk' (not a manager: no wages, no staff edits, no reports)
--   * employees.face_descriptors — 128-d face-recognition descriptors
--     captured by a manager during enrollment (several samples per worker)
--   * kiosk_roster() — the ONLY way a kiosk reads workers: names + face data,
--     never wages
--   * kiosk may insert/close attendance for any active worker, with the same
--     validity rules an employee's own clock-in/out already has

-- 1) Role + column ----------------------------------------------------------
alter table employees drop constraint if exists employees_role_check;
alter table employees add constraint employees_role_check
  check (role in ('employee','manager','owner','kiosk'));

alter table employees add column if not exists face_descriptors jsonb;

-- 2) Helper ------------------------------------------------------------------
create or replace function is_kiosk()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from employees
    where user_id = auth.uid() and role = 'kiosk' and active and deleted = false
  );
$$;
revoke execute on function is_kiosk() from public;
grant execute on function is_kiosk() to authenticated;

-- 3) Roster for the kiosk (no wage columns) ---------------------------------
create or replace function kiosk_roster()
returns table (
  user_id uuid,
  full_name text,
  department text,
  job_title text,
  reference_photo text,
  face_descriptors jsonb
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (is_kiosk() or is_manager()) then
    raise exception 'غير مسموح';
  end if;
  return query
    select e.user_id, coalesce(e.full_name, e.name, e.handle), e.department, e.job_title,
           e.reference_photo, e.face_descriptors
    from employees e
    where e.deleted = false and e.active
      and e.role in ('employee','manager')
      and e.user_id is not null;
end;
$$;
revoke execute on function kiosk_roster() from public, anon;
grant execute on function kiosk_roster() to authenticated;

-- 4) Attendance access for the kiosk ----------------------------------------
create policy attendance_kiosk_select on attendance for select using (is_kiosk());
create policy attendance_kiosk_insert on attendance for insert with check (is_kiosk());
create policy attendance_kiosk_update on attendance for update using (is_kiosk()) with check (is_kiosk());

-- Insert guard: a kiosk may clock in ANY active worker, but only with a
-- well-formed open record (same rules as an employee's own clock-in).
create or replace function enforce_attendance_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_manager() or auth.role() = 'service_role' then
    return new;
  end if;
  if is_kiosk() then
    if not exists (
      select 1 from employees
      where user_id = new.employee_user_id and deleted = false and active and role in ('employee','manager')
    ) then
      raise exception 'الموظف غير موجود أو موقوف';
    end if;
  elsif new.employee_user_id is distinct from auth.uid() then
    raise exception 'غير مسموح بتسجيل حضور لموظف آخر';
  end if;
  if new.status is distinct from 'in' or new.check_out is not null
     or coalesce(new.worked_hours, 0) <> 0 or coalesce(new.overtime_hours, 0) <> 0
  then
    raise exception 'سجل حضور غير صالح';
  end if;
  return new;
end;
$$;
-- (update guard from 0005 already applies to the kiosk unchanged: it can only
-- close an open record and cannot change who/when it belongs to.)

-- 5) Workers can't overwrite their own face data (would let one worker
--    register a colleague's face under their own name).
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
  then
    raise exception 'غير مسموح بتعديل هذا الحقل';
  end if;
  return new;
end;
$$;

revoke execute on function enforce_employee_self_update() from public, anon, authenticated;
revoke execute on function enforce_attendance_insert() from public, anon, authenticated;
