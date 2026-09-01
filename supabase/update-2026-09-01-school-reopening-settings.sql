-- School location editing and different reopening dates.
-- This lets admin set a reopening date for each school.
-- Attendance deductions will not be created for a school before that school's reopening date.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.status, 'active') = 'active'
  );
$$;

alter table public.schools
add column if not exists reopening_date date,
add column if not exists reopening_note text,
add column if not exists active boolean not null default true,
add column if not exists updated_at timestamptz default now();

alter table public.schools enable row level security;

drop policy if exists "schools_select_authenticated" on public.schools;
create policy "schools_select_authenticated" on public.schools
for select to authenticated
using (true);

drop policy if exists "schools_admin_insert" on public.schools;
create policy "schools_admin_insert" on public.schools
for insert to authenticated
with check (public.is_admin());

drop policy if exists "schools_admin_update" on public.schools;
create policy "schools_admin_update" on public.schools
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create index if not exists idx_schools_reopening_date on public.schools(reopening_date);
create index if not exists idx_schools_active on public.schools(active);

-- Recreate the deduction function so schools are ignored before their reopening date.
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
