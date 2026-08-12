-- Attendance deduction workflow.
-- Creates a GHS 10 pending deduction when a staff member misses check-in
-- on a designated timetable day. Admin must approve before it counts as a deduction.

create table if not exists public.attendance_deductions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid references public.schools(id),
  timetable_id uuid references public.staff_timetables(id) on delete set null,
  work_date date not null,
  day_of_week text,
  amount numeric(10,2) not null default 10.00,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.attendance_deductions enable row level security;

create unique index if not exists idx_attendance_deductions_unique_day_school
on public.attendance_deductions(staff_id, school_id, work_date);

create index if not exists idx_attendance_deductions_staff_date
on public.attendance_deductions(staff_id, work_date desc);

create index if not exists idx_attendance_deductions_status_date
on public.attendance_deductions(status, work_date desc);

create or replace function public.is_admin_or_supervisor()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (p.role = 'admin' or p.position ilike '%supervisor%')
  );
$$;

drop policy if exists "attendance_deductions_select" on public.attendance_deductions;
create policy "attendance_deductions_select" on public.attendance_deductions
for select to authenticated
using (staff_id = auth.uid() or public.is_admin_or_supervisor());

drop policy if exists "attendance_deductions_admin_update" on public.attendance_deductions;
create policy "attendance_deductions_admin_update" on public.attendance_deductions
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Admins can manually insert a correction if needed.
drop policy if exists "attendance_deductions_admin_insert" on public.attendance_deductions;
create policy "attendance_deductions_admin_insert" on public.attendance_deductions
for insert to authenticated
with check (public.is_admin());

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

-- Optional automatic daily check using Supabase Cron/pg_cron.
-- If pg_cron is not enabled in your Supabase project, the manual button on /deductions still works.
do $deduction_cron$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    raise notice 'pg_cron extension could not be enabled automatically. Use Supabase Cron UI or the manual button.';
  end;

  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule('mezzo_daily_attendance_deduction_check');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'mezzo_daily_attendance_deduction_check',
      '0 18 * * 1-5',
      $cron_job$select public.create_daily_attendance_deductions(((now() at time zone 'Africa/Accra')::date));$cron_job$
    );
  end if;
end
$deduction_cron$;
