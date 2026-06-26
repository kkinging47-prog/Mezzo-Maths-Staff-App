create table if not exists public.supervisor_reports (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  staff_id uuid not null references public.profiles(id),
  visit_date date not null,
  location text,
  class_observed text,
  lesson_topic text,
  visit_type text,
  arrival_time time,
  class_start_time time,
  lesson_plan_available boolean,
  teaching_materials_ready boolean,
  teacher_conduct text,
  classroom_prepared boolean,
  checklist jsonb not null default '{}'::jsonb,
  student_understanding integer,
  student_engagement integer,
  solving_accuracy integer,
  confidence_answers integer,
  participation_level integer,
  strengths text,
  improvement_areas text,
  feedback_given text,
  teacher_response text,
  action_points text,
  improvement_timeline text,
  logistics jsonb not null default '{}'::jsonb,
  policy_compliance text,
  overall_rating text,
  recommendations text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.supervisor_reports enable row level security;

create or replace function public.is_supervisor_or_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'admin' or position ilike '%supervisor%')
  );
$$;

drop policy if exists "profiles_select_supervisor" on public.profiles;
create policy "profiles_select_supervisor" on public.profiles for select to authenticated using (public.is_supervisor_or_admin());

drop policy if exists "weekly_reports_select_supervisor" on public.weekly_reports;
create policy "weekly_reports_select_supervisor" on public.weekly_reports for select to authenticated using (staff_id = auth.uid() or public.is_supervisor_or_admin());

drop policy if exists "supervisor_reports_select" on public.supervisor_reports;
create policy "supervisor_reports_select" on public.supervisor_reports for select to authenticated using (public.is_supervisor_or_admin() or supervisor_id = auth.uid() or staff_id = auth.uid());

drop policy if exists "supervisor_reports_insert" on public.supervisor_reports;
create policy "supervisor_reports_insert" on public.supervisor_reports for insert to authenticated with check (supervisor_id = auth.uid() and public.is_supervisor_or_admin());

drop policy if exists "supervisor_reports_update" on public.supervisor_reports;
create policy "supervisor_reports_update" on public.supervisor_reports for update to authenticated using (supervisor_id = auth.uid() or public.is_admin()) with check (supervisor_id = auth.uid() or public.is_admin());

drop policy if exists "workbook_orders_select_all" on public.workbook_orders;
drop policy if exists "workbook_orders_select_limited" on public.workbook_orders;
create policy "workbook_orders_select_limited" on public.workbook_orders for select to authenticated using (public.is_admin() or exists (select 1 from public.staff_school_assignments s where s.staff_id = auth.uid() and s.school_id = workbook_orders.school_id));

drop policy if exists "workbook_supplies_select_all" on public.workbook_supplies;
drop policy if exists "workbook_supplies_select_limited" on public.workbook_supplies;
create policy "workbook_supplies_select_limited" on public.workbook_supplies for select to authenticated using (public.is_admin() or exists (select 1 from public.staff_school_assignments s where s.staff_id = auth.uid() and s.school_id = workbook_supplies.school_id));

drop policy if exists "student_counts_select_all" on public.class_student_counts;
drop policy if exists "student_counts_select_limited" on public.class_student_counts;
create policy "student_counts_select_limited" on public.class_student_counts for select to authenticated using (public.is_admin() or staff_id = auth.uid() or exists (select 1 from public.staff_school_assignments s where s.staff_id = auth.uid() and s.school_id = class_student_counts.school_id));

create index if not exists idx_supervisor_reports_supervisor_date on public.supervisor_reports(supervisor_id, visit_date desc);
create index if not exists idx_supervisor_reports_staff_date on public.supervisor_reports(staff_id, visit_date desc);
create index if not exists idx_supervisor_reports_school_date on public.supervisor_reports(school_id, visit_date desc);
create index if not exists idx_weekly_reports_submitted on public.weekly_reports(submitted_at desc);
create index if not exists idx_company_posts_realtime on public.company_posts(archived_at, created_at desc);
