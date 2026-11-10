-- 0010 — Manager review of flagged records, automatic clock-out for workers
-- who forgot, and gate-device (kiosk) status reporting.

-- 1) Review + auto-close + which gate device recorded it --------------------
alter table attendance add column if not exists review_status text
  check (review_status in ('ok','rejected'));
alter table attendance add column if not exists reviewed_at timestamptz;
alter table attendance add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table attendance add column if not exists auto_closed boolean not null default false;
alter table attendance add column if not exists device_name text;

-- Only managers may set review fields (employees/kiosk go through the
-- update guard, which now also locks these columns for them).
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
  -- Server-side job (auto clock-out via pg_cron) runs with no auth.uid();
  -- RLS already blocks anonymous API clients from updating at all.
  if auth.uid() is null and session_user in ('postgres', 'supabase_admin') then
    if new.check_out is not null and new.check_in is not null then
      new.worked_hours := round((extract(epoch from (new.check_out - new.check_in)) / 3600)::numeric, 4);
    end if;
    return new;
  end if;
  if old.check_out is not null then
    raise exception 'لا يمكن تعديل سجل مغلق';
  end if;
  if new.employee_user_id is distinct from old.employee_user_id
     or new.check_in is distinct from old.check_in
     or new.date is distinct from old.date
     or new.review_status is distinct from old.review_status
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by
     or new.auto_closed is distinct from old.auto_closed
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
revoke execute on function enforce_attendance_update() from public, anon, authenticated;

-- Non-managers can't pre-set review/auto-close on insert either.
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
  new.review_status := null;
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.auto_closed := false;
  return new;
end;
$$;
revoke execute on function enforce_attendance_insert() from public, anon, authenticated;

-- 2) Automatic clock-out -------------------------------------------------------
-- Any record still open 2 hours after its shift end is closed AT the shift
-- end, marked auto_closed for the manager to review. Uses the worker's
-- department shift when set, else the company shift. Times are interpreted in
-- the company timezone (settings.shift.timezone, saved from the manager's
-- device; Asia/Baghdad if never set). Night shifts (end <= start) end the
-- next day.
create or replace function auto_close_open_attendance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  g jsonb := coalesce((select value from settings where key = 'shift'), '{}'::jsonb);
  tz text := coalesce(nullif(g->>'timezone', ''), 'Asia/Baghdad');
  r record;
  s_start text;
  s_end text;
  end_ts timestamptz;
  n integer := 0;
begin
  for r in
    select a.*, d.start_time as d_start, d.end_time as d_end
    from attendance a
    left join departments d on d.name = a.department
    where a.status = 'in' and a.check_out is null and a.check_in is not null
  loop
    if r.d_start is not null and r.d_end is not null then
      s_start := r.d_start; s_end := r.d_end;
    else
      s_start := coalesce(g->>'startTime', '09:00'); s_end := coalesce(g->>'endTime', '17:00');
    end if;
    end_ts := ((r.date::text || ' ' || s_end)::timestamp at time zone tz);
    if s_end::time <= s_start::time then
      end_ts := end_ts + interval '1 day';
    end if;
    if now() > end_ts + interval '2 hours' then
      update attendance set
        check_out = greatest(end_ts, r.check_in),
        status = 'out',
        overtime_hours = 0,
        auto_closed = true
      where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function auto_close_open_attendance() from public, anon, authenticated;

select cron.unschedule('auto-close-open-attendance')
  where exists (select 1 from cron.job where jobname = 'auto-close-open-attendance');
select cron.schedule('auto-close-open-attendance', '*/15 * * * *', 'select public.auto_close_open_attendance()');

-- 3) Gate device status ------------------------------------------------------
create table if not exists kiosk_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  last_seen timestamptz not null default now(),
  pending integer not null default 0,
  failed integer not null default 0,
  roster_count integer not null default 0,
  location_status text,
  app_version text,
  updated_at timestamptz not null default now()
);
alter table kiosk_devices enable row level security;

create policy kiosk_devices_select on kiosk_devices for select
  using (is_manager() or user_id = auth.uid());
create policy kiosk_devices_upsert_self on kiosk_devices for insert
  with check (user_id = auth.uid() and is_kiosk());
create policy kiosk_devices_update_self on kiosk_devices for update
  using (user_id = auth.uid() and is_kiosk()) with check (user_id = auth.uid() and is_kiosk());
create policy kiosk_devices_delete_manager on kiosk_devices for delete using (is_manager());

-- live updates for the manager's status card
alter publication supabase_realtime add table kiosk_devices;
