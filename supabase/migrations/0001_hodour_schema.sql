-- Hodour backend schema: employees, attendance, lookup tables, settings,
-- RLS (manager-sees-all / employee-sees-own-rows), and notification rules.
--
-- Run this once against a fresh Supabase project (SQL editor, or `supabase db push`).
-- After running it, bootstrap the owner account manually — see supabase/README.md.

create extension if not exists "pgcrypto";

-- ============================================================
-- employees
-- ============================================================
create table employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  handle text unique,
  role text not null default 'employee' check (role in ('employee','manager','owner')),
  full_name text,
  name text,
  department text,
  job_title text,
  daily_wage numeric default 0,
  overtime_rate numeric default 0,
  active boolean not null default true,
  deleted boolean not null default false,
  reference_photo text,
  created_at timestamptz not null default now()
);
create index idx_employees_user_id on employees(user_id);
create index idx_employees_active on employees(active) where deleted = false;

-- ============================================================
-- attendance
-- ============================================================
create table attendance (
  id uuid primary key default gen_random_uuid(),
  employee_user_id uuid not null references auth.users(id) on delete cascade,
  employee_name text,
  department text,
  job_title text,
  date date not null,
  check_in timestamptz,
  check_out timestamptz,
  late_minutes integer default 0,
  worked_hours numeric default 0,
  overtime_hours numeric default 0,
  gps_lat double precision,
  gps_lng double precision,
  gps_accuracy double precision,
  distance double precision,
  location_name text,
  face_verified boolean default false,
  face_snapshot text,
  out_lat double precision,
  out_lng double precision,
  out_face_snapshot text,
  status text check (status in ('in','out')),
  gps_suspicious boolean default false,
  gps_flag_reason text,
  created_at timestamptz not null default now()
);
create index idx_attendance_user_date on attendance(employee_user_id, date);
create index idx_attendance_date on attendance(date);
create index idx_attendance_created on attendance(created_at desc);

-- ============================================================
-- departments / job_titles / locations (simple lookup tables)
-- ============================================================
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table job_titles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  radius double precision not null default 100,
  created_at timestamptz not null default now()
);

-- ============================================================
-- settings — singleton rows keyed by literal id = key ('company' | 'shift')
-- ============================================================
create table settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- notification_rules / notifications (backs triggers.js)
-- ============================================================
create table notification_rules (
  id uuid primary key default gen_random_uuid(),
  collection text not null,
  on_events text[] not null,
  when_cond jsonb not null,
  title text not null,
  body text not null,
  target jsonb,
  created_at timestamptz not null default now()
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references notification_rules(id) on delete cascade,
  title text,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_created on notifications(created_at desc);

-- ============================================================
-- is_manager() — RLS helper. Managers/owners see everything, employees only
-- see their own rows.
-- ============================================================
create or replace function is_manager()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from employees
    where user_id = auth.uid() and role in ('manager','owner') and deleted = false
  );
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table employees enable row level security;
alter table attendance enable row level security;
alter table departments enable row level security;
alter table job_titles enable row level security;
alter table locations enable row level security;
alter table settings enable row level security;
alter table notification_rules enable row level security;
alter table notifications enable row level security;

-- employees: managers see/write all; a person can see and update their own row.
create policy employees_select on employees for select
  using (is_manager() or user_id = auth.uid());
create policy employees_all_manager on employees for all
  using (is_manager()) with check (is_manager());
create policy employees_update_self on employees for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- attendance: manager sees/writes all; employee sees/writes only their own rows.
create policy attendance_select on attendance for select
  using (is_manager() or employee_user_id = auth.uid());
create policy attendance_insert on attendance for insert
  with check (is_manager() or employee_user_id = auth.uid());
create policy attendance_update on attendance for update
  using (is_manager() or employee_user_id = auth.uid())
  with check (is_manager() or employee_user_id = auth.uid());
create policy attendance_delete_manager on attendance for delete
  using (is_manager());

-- departments / job_titles / locations / settings: everyone signed-in can read,
-- only managers can write.
create policy lookup_select_departments on departments for select using (auth.uid() is not null);
create policy lookup_write_departments on departments for all using (is_manager()) with check (is_manager());
create policy lookup_select_job_titles on job_titles for select using (auth.uid() is not null);
create policy lookup_write_job_titles on job_titles for all using (is_manager()) with check (is_manager());
create policy lookup_select_locations on locations for select using (auth.uid() is not null);
create policy lookup_write_locations on locations for all using (is_manager()) with check (is_manager());
create policy settings_select on settings for select using (auth.uid() is not null);
create policy settings_write on settings for all using (is_manager()) with check (is_manager());

-- notification_rules / notifications: manager-only.
create policy notification_rules_all on notification_rules for all
  using (is_manager()) with check (is_manager());
create policy notifications_select on notifications for select using (is_manager());

-- ============================================================
-- attendance -> notifications trigger
-- ============================================================
create or replace function evaluate_attendance_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select * from notification_rules
    where collection = 'attendance' and TG_OP = any(on_events)
  loop
    if (r.when_cond ? 'gpsSuspicious'
          and NEW.gps_suspicious = (r.when_cond->>'gpsSuspicious')::boolean)
       or (r.when_cond @> '{"lateMinutes":{}}'
          and NEW.late_minutes > ((r.when_cond#>>'{lateMinutes,gt}')::int)) then
      insert into notifications(rule_id, title, body) values (
        r.id,
        r.title,
        replace(
          replace(r.body, '{{employeeName}}', coalesce(NEW.employee_name, '')),
          '{{lateMinutes}}', NEW.late_minutes::text
        )
      );
    end if;
  end loop;
  return NEW;
end;
$$;

create trigger attendance_notify
  after insert or update on attendance
  for each row execute function evaluate_attendance_notifications();

-- ============================================================
-- Realtime — useLiveShared() subscribes to postgres_changes on these tables.
-- ============================================================
alter publication supabase_realtime add table attendance;
alter publication supabase_realtime add table employees;
alter publication supabase_realtime add table notifications;

-- ============================================================
-- Storage — private bucket for face snapshots + JSON backups.
-- Any signed-in user can upload/read within it (storage.js issues signed
-- URLs, so raw object access still requires SELECT here to mint one).
-- ============================================================
insert into storage.buckets (id, name, public)
values ('hodour-files', 'hodour-files', false)
on conflict (id) do nothing;

create policy hodour_files_insert on storage.objects for insert
  with check (bucket_id = 'hodour-files' and auth.uid() is not null);
create policy hodour_files_select on storage.objects for select
  using (bucket_id = 'hodour-files' and auth.uid() is not null);
create policy hodour_files_update on storage.objects for update
  using (bucket_id = 'hodour-files' and auth.uid() is not null);
