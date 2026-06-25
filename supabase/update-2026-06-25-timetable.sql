-- Timetable update. Run after previous 25 June SQL patches.

create or replace function public.is_supervisor_or_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        role = 'admin'
        or department = 'Supervision'
        or position ilike '%supervisor%'
      )
  );
$$;

create table if not exists public.staff_timetables (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  school_name text not null,
  location text not null,
  class_name text not null,
  day_of_week text not null check (day_of_week in ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  day_order integer not null check (day_order between 1 and 5),
  start_time time not null,
  duration_minutes integer not null check (duration_minutes in (30,40,45,50,60)),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.staff_timetables enable row level security;

drop policy if exists "timetable_select_own_or_supervisor" on public.staff_timetables;
create policy "timetable_select_own_or_supervisor" on public.staff_timetables
for select to authenticated
using (staff_id = auth.uid() or public.is_supervisor_or_admin());

drop policy if exists "timetable_insert_own" on public.staff_timetables;
create policy "timetable_insert_own" on public.staff_timetables
for insert to authenticated
with check (staff_id = auth.uid());

drop policy if exists "timetable_update_own_or_admin" on public.staff_timetables;
create policy "timetable_update_own_or_admin" on public.staff_timetables
for update to authenticated
using (staff_id = auth.uid() or public.is_admin())
with check (staff_id = auth.uid() or public.is_admin());

drop policy if exists "timetable_delete_own_or_admin" on public.staff_timetables;
create policy "timetable_delete_own_or_admin" on public.staff_timetables
for delete to authenticated
using (staff_id = auth.uid() or public.is_admin());

-- Supervisors need read access to tutor attendance and activities.
drop policy if exists "attendance_select_dashboard" on public.attendance;
create policy "attendance_select_dashboard" on public.attendance for select to authenticated using (true);

drop policy if exists "activities_select_all" on public.special_class_activities;
create policy "activities_select_all" on public.special_class_activities for select to authenticated using (true);
