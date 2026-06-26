-- Term-based records, birthday notices, and points for 2026/2027.
-- Run after earlier 25 June update files.

create extension if not exists "pg_cron";

-- Current academic settings
insert into public.company_settings (key, value) values ('current_academic_year', '2026/2027') on conflict (key) do nothing;
insert into public.company_settings (key, value) values ('current_term', 'Term 1') on conflict (key) do nothing;

-- Term fields for records that should be separated by term.
alter table public.attendance add column if not exists academic_year text not null default '2026/2027';
alter table public.attendance add column if not exists term text not null default 'Term 1';
alter table public.weekly_reports add column if not exists academic_year text not null default '2026/2027';
alter table public.weekly_reports add column if not exists term text not null default 'Term 1';
alter table public.special_class_activities add column if not exists academic_year text not null default '2026/2027';
alter table public.special_class_activities add column if not exists term text not null default 'Term 1';
alter table public.workbook_orders add column if not exists academic_year text not null default '2026/2027';
alter table public.workbook_orders add column if not exists term text not null default 'Term 1';
alter table public.workbook_supplies add column if not exists academic_year text not null default '2026/2027';
alter table public.workbook_supplies add column if not exists term text not null default 'Term 1';
alter table public.class_student_counts add column if not exists academic_year text not null default '2026/2027';
alter table public.class_student_counts add column if not exists term text not null default 'Term 1';
alter table public.staff_timetables add column if not exists academic_year text not null default '2026/2027';
alter table public.staff_timetables add column if not exists term text not null default 'Term 1';

-- Replace older unique constraint for enrollment with term-aware one.
alter table public.class_student_counts drop constraint if exists class_student_counts_staff_id_school_id_class_name_key;
create unique index if not exists class_student_counts_unique_term
on public.class_student_counts(staff_id, school_id, class_name, academic_year, term);

-- Points table. Attendance and special activities add point records.
create table if not exists public.staff_points (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  points integer not null,
  reason text not null,
  awarded_on date not null default ((now() at time zone 'Africa/Accra')::date),
  academic_year text not null default '2026/2027',
  term text not null default 'Term 1',
  created_at timestamptz default now(),
  unique (source_type, source_id)
);

alter table public.staff_points enable row level security;

drop policy if exists "points_select_all" on public.staff_points;
create policy "points_select_all" on public.staff_points for select to authenticated using (true);
drop policy if exists "points_admin_all" on public.staff_points;
create policy "points_admin_all" on public.staff_points for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.current_academic_year()
returns text language sql stable as $$
  select coalesce((select value from public.company_settings where key = 'current_academic_year'), '2026/2027');
$$;

create or replace function public.current_term()
returns text language sql stable as $$
  select coalesce((select value from public.company_settings where key = 'current_term'), 'Term 1');
$$;

create or replace function public.award_attendance_points()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  score integer;
  label text;
begin
  if new.status = 'absent' then
    score := -3;
    label := 'No check-in before deadline';
  else
    score := 10;
    label := 'Daily attendance';
  end if;

  insert into public.staff_points (staff_id, source_type, source_id, points, reason, awarded_on, academic_year, term)
  values (new.staff_id, 'attendance', new.id, score, label, new.work_date, coalesce(new.academic_year, public.current_academic_year()), coalesce(new.term, public.current_term()))
  on conflict (source_type, source_id) do update set points = excluded.points, reason = excluded.reason;
  return new;
end;
$$;

drop trigger if exists attendance_points_trigger on public.attendance;
create trigger attendance_points_trigger
after insert or update of status on public.attendance
for each row execute function public.award_attendance_points();

create or replace function public.award_activity_points()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.staff_points (staff_id, source_type, source_id, points, reason, awarded_on, academic_year, term)
  values (new.staff_id, 'special_activity', new.id, 5, 'Special class activity', (new.created_at at time zone 'Africa/Accra')::date, coalesce(new.academic_year, public.current_academic_year()), coalesce(new.term, public.current_term()))
  on conflict (source_type, source_id) do nothing;
  return new;
end;
$$;

drop trigger if exists special_activity_points_trigger on public.special_class_activities;
create trigger special_activity_points_trigger
after insert on public.special_class_activities
for each row execute function public.award_activity_points();

-- Backfill points for already existing records.
insert into public.staff_points (staff_id, source_type, source_id, points, reason, awarded_on, academic_year, term)
select staff_id, 'attendance', id, case when status = 'absent' then -3 else 10 end, case when status = 'absent' then 'No check-in before deadline' else 'Daily attendance' end, work_date, academic_year, term
from public.attendance
on conflict (source_type, source_id) do nothing;

insert into public.staff_points (staff_id, source_type, source_id, points, reason, awarded_on, academic_year, term)
select staff_id, 'special_activity', id, 5, 'Special class activity', (created_at at time zone 'Africa/Accra')::date, academic_year, term
from public.special_class_activities
on conflict (source_type, source_id) do nothing;

-- Daily birthday notice for admins.
create or replace function public.notify_admin_birthdays()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  today date := ((now() at time zone 'Africa/Accra')::date);
begin
  insert into public.notifications (user_id, title, body)
  select admin.id,
         'Birthday card due',
         'Generate birthday e-card for ' || coalesce(staff.full_name, staff.email, 'staff member') || ' today.'
  from public.profiles staff
  cross join public.profiles admin
  where staff.status = 'active'
    and admin.role = 'admin'
    and staff.date_of_birth is not null
    and extract(month from staff.date_of_birth) = extract(month from today)
    and extract(day from staff.date_of_birth) = extract(day from today)
    and not exists (
      select 1 from public.notifications n
      where n.user_id = admin.id
        and n.title = 'Birthday card due'
        and n.body ilike '%' || coalesce(staff.full_name, staff.email, 'staff member') || '%'
        and n.created_at::date = today
    );
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-birthday-card-reminder') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'daily-birthday-card-reminder';
  end if;
  perform cron.schedule('daily-birthday-card-reminder', '0 7 * * *', $cron$select public.notify_admin_birthdays();$cron$);
end;
$$;

-- Helpful indexes.
create index if not exists idx_staff_points_period on public.staff_points(academic_year, term, awarded_on desc);
create index if not exists idx_staff_points_staff_date on public.staff_points(staff_id, awarded_on desc);
create index if not exists idx_timetable_term on public.staff_timetables(academic_year, term, staff_id, day_order, start_time);
create index if not exists idx_workbook_orders_term on public.workbook_orders(academic_year, term, school_id, class_name);
create index if not exists idx_workbook_supplies_term on public.workbook_supplies(academic_year, term, school_id, class_name);
create index if not exists idx_student_counts_term on public.class_student_counts(academic_year, term, school_id, class_name);
create index if not exists idx_activities_term on public.special_class_activities(academic_year, term, staff_id);
