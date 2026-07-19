-- The self-update guards added in 0003 gate their bypass on is_manager(),
-- which reads employees.user_id = auth.uid() — under a service-role call
-- (edge functions, cron jobs, e.g. cleanup-old-photos) there is no auth.uid(),
-- so is_manager() returns false and the guards would wrongly treat trusted
-- server-side maintenance as an employee self-edit (e.g. rejecting an update
-- to an already-closed attendance row). Bypass for auth.role() = 'service_role'
-- too — that role only reaches Postgres via the service_role key, which never
-- leaves server-side code (edge functions, this migration tooling).

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

create or replace function enforce_attendance_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_manager() or auth.role() = 'service_role' then
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
