-- 0006 added employees.wage_type/monthly_salary but the self-update guard
-- from 0003/0005 didn't know about them yet, leaving a window where a
-- non-manager could set their own wage_type/monthly_salary directly via the
-- API. Add them to the protected-column list.
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
  then
    raise exception 'غير مسموح بتعديل هذا الحقل';
  end if;

  return new;
end;
$$;
