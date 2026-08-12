-- Exempt all admin accounts from attendance deductions.
-- Run this after update-2026-08-12-attendance-deductions.sql.

-- Cancel any deduction records already created for admin users.
update public.attendance_deductions d
set
  status = 'cancelled',
  admin_notes = trim(coalesce(d.admin_notes || E'\n', '') || 'Cancelled automatically: admin accounts are exempt from attendance deductions.'),
  updated_at = now()
from public.profiles p
where p.id = d.staff_id
  and p.role = 'admin'
  and d.status in ('pending', 'approved');

-- Recreate the defaulter check so admin users are never selected.
create or replace function public.create_daily_attendance_deductions(
  p_work_date date default ((now() at time zone 'Africa/Accra')::date)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  with missed as (
    select distinct on (t.staff_id, t.school_id)
      t.staff_id,
      t.school_id,
      t.id as timetable_id,
      p_work_date as work_date,
      t.day_of_week,
      10.00::numeric(10,2) as amount,
      'Missed attendance check-in for designated class at ' || coalesce(s.name, t.school_name, 'assigned school') || ' on ' || p_work_date::text as reason
    from public.staff_timetables t
    join public.profiles p on p.id = t.staff_id
    left join public.schools s on s.id = t.school_id
    where lower(trim(t.day_of_week)) = lower(trim(to_char(p_work_date, 'FMDay')))
      and coalesce(p.status, 'active') = 'active'
      and coalesce(p.role, 'staff') <> 'admin'
      and not exists (
        select 1
        from public.attendance a
        where a.staff_id = t.staff_id
          and a.work_date = p_work_date
          and (t.school_id is null or a.school_id = t.school_id)
          and coalesce(a.status, '') <> 'absent'
      )
    order by t.staff_id, t.school_id, t.start_time nulls last
  )
  insert into public.attendance_deductions(staff_id, school_id, timetable_id, work_date, day_of_week, amount, reason, status)
  select staff_id, school_id, timetable_id, work_date, day_of_week, amount, reason, 'pending'
  from missed
  on conflict (staff_id, school_id, work_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

grant execute on function public.create_daily_attendance_deductions(date) to authenticated;
