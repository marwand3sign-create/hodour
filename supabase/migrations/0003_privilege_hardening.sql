-- Security hardening: RLS alone (row-level "is this my row?") doesn't stop a
-- non-manager from rewriting *which columns* on their own row — that needs
-- triggers. Fixes, in order:
--
-- 1) employees_update_self let an employee set any column on their own row,
--    including `role` — a one-line client-side call made them a manager/owner.
-- 2) attendance_insert let an employee insert a fully fabricated record
--    (already checked out, arbitrary hours) — never touching the camera/GPS
--    flow in Clock.jsx.
-- 3) attendance_update let an employee edit a closed record after the fact:
--    inflate worked/overtime hours, or flip gps_suspicious / face_mismatch
--    back to false to erase their own fraud flags.

-- ============================================================
-- employees: non-managers may only touch their own reference photo/embedding
-- (the one legitimate self-write path — see Clock.jsx's first-check-in flow).
-- Everything else (role, wage, department, active, deleted, ...) requires
-- is_manager().
-- ============================================================
create or replace function enforce_employee_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_manager() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.daily_wage is distinct from old.daily_wage
     or new.overtime_rate is distinct from old.overtime_rate
     or new.active is distinct from old.active
     or new.deleted is distinct from old.deleted
     or new.department is distinct from old.department
     or new.job_title is distinct from old.job_title
     or new.full_name is distinct from old.full_name
     or new.name is distinct from old.name
     or new.handle is distinct from old.handle
     or new.user_id is distinct from old.user_id
  then
    raise exception 'غير مسموح بتعديل هذا الحقل';
  end if;

  return new;
end;
$$;

drop trigger if exists employees_self_update_guard on employees;
create trigger employees_self_update_guard
  before update on employees
  for each row execute function enforce_employee_self_update();

-- ============================================================
-- attendance: a non-manager insert must look exactly like a fresh clock-in
-- (open, zeroed hours) — the manager-only path (imports, corrections) is
-- unaffected since is_manager() short-circuits the whole check.
-- ============================================================
create or replace function enforce_attendance_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_manager() then
    return new;
  end if;

  if new.employee_user_id is distinct from auth.uid() then
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

drop trigger if exists attendance_insert_guard on attendance;
create trigger attendance_insert_guard
  before insert on attendance
  for each row execute function enforce_attendance_insert();

-- ============================================================
-- attendance: a non-manager may only close their own still-open record
-- (the clock-out step) — check-in time is immutable, hours are recomputed
-- from the actual timestamps rather than trusted from the client, and the
-- suspicion/mismatch flags can only be raised, never cleared, by the person
-- they were raised against.
-- ============================================================
create or replace function enforce_attendance_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_manager() then
    return new;
  end if;

  if old.check_out is not null then
    raise exception 'لا يمكن تعديل سجل مغلق';
  end if;
  if new.employee_user_id is distinct from old.employee_user_id
     or new.check_in is distinct from old.check_in
     or new.date is distinct from old.date
  then
    raise exception 'غير مسموح بتعديل هذا الحقل';
  end if;

  if new.check_out is not null then
    new.worked_hours := round((extract(epoch from (new.check_out - old.check_in)) / 3600)::numeric, 4);
  end if;
  new.overtime_hours := least(greatest(coalesce(new.overtime_hours, 0), 0), coalesce(new.worked_hours, 0));

  if old.gps_suspicious and not new.gps_suspicious then
    new.gps_suspicious := true;
  end if;
  if old.face_mismatch and not new.face_mismatch then
    new.face_mismatch := true;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_update_guard on attendance;
create trigger attendance_update_guard
  before update on attendance
  for each row execute function enforce_attendance_update();
