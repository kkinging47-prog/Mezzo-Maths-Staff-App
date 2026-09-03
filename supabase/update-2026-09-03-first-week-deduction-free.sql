-- First week deduction-free rule.
-- Attendance deductions will not be created for a staff member during the first 7 calendar days
-- from their date_employed value in profiles.
-- Example: if date_employed is 2026-09-01, deductions can start from 2026-09-08.

create or replace function public.create_daily_attendance_deductions(p_work_date date default ((now() at time zone 'Africa/Accra')::date))
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  day_name text;
begin
  day_name := trim(to_char(p_work_date, 'Day'));

  insert into public.attendance_deductions (
    staff_id,
    school_id,
    timetable_id,
    work_date,
    day_of_week,
    amount,
    reason,
    status
  )
  select
    t.staff_id,
    t.school_id,
    t.id,
    p_work_date,
    t.day_of_week,
    10.00,
    'No attendance check-in recorded for ' || coalesce(s.name, t.school_name, 'assigned school') || ' on ' || p_work_date::text,
    'pending'
  from public.staff_timetables t
  join public.profiles p on p.id = t.staff_id
  left join public.schools s on s.id = t.school_id
  where t.day_of_week = day_name
    and coalesce(p.status, 'active') = 'active'
    and coalesce(p.role, 'staff') <> 'admin'
    and coalesce(s.active, true) = true
    and (s.reopening_date is null or p_work_date >= s.reopening_date)
    and (p.date_employed is null or p_work_date >= (p.date_employed + interval '7 days')::date)
    and not exists (
      select 1
      from public.attendance a
      where a.staff_id = t.staff_id
        and a.work_date = p_work_date
        and (a.school_id = t.school_id or t.school_id is null)
        and coalesce(a.status, '') <> 'absent'
    )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.create_daily_attendance_deductions(date) to authenticated;
