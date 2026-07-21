-- Lets a manager manually adjust attendance: edit worked/overtime hours or
-- clear a lateness flag on a real clock-in record, or add a standalone
-- "extra day" credit (a bonus paid day not tied to any actual clock-in/out —
-- e.g. compensating a public holiday worked, or a manual correction).
alter table attendance add column is_manual boolean not null default false;
alter table attendance add column note text;
