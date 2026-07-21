-- 1) Monthly-salary employees (in addition to daily-wage ones). Effective
--    daily rate for payroll = monthly_salary / (days in the report period's
--    month) when wage_type = 'monthly' — computed client-side (store.js),
--    not stored, since it depends on which month is being reported on.
alter table employees add column wage_type text not null default 'daily' check (wage_type in ('daily', 'monthly'));
alter table employees add column monthly_salary numeric default 0;

-- 2) Per-department shift hours (e.g. one department 6am-2pm, another
--    6am-5pm). Null = department has no override, falls back to the global
--    shift in settings('shift') — existing departments keep working exactly
--    as before this migration.
alter table departments add column start_time text;
alter table departments add column end_time text;
alter table departments add column grace_minutes integer;
