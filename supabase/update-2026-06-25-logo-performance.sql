-- Logo upload, public logo access, and performance indexes.
-- Run after the previous 25 June SQL updates.

-- Make sure company settings exists.
create table if not exists public.company_settings (
  key text primary key,
  value text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

alter table public.company_settings enable row level security;

-- Let the login page read the public logo setting before a user signs in.
drop policy if exists "settings_select_all" on public.company_settings;
drop policy if exists "settings_public_read" on public.company_settings;
create policy "settings_public_read" on public.company_settings
for select to anon, authenticated
using (true);

drop policy if exists "settings_admin_all" on public.company_settings;
create policy "settings_admin_all" on public.company_settings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Public company assets bucket for the logo.
insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "company_assets_public_read" on storage.objects;
create policy "company_assets_public_read" on storage.objects
for select to anon, authenticated
using (bucket_id = 'company-assets');

drop policy if exists "company_assets_admin_upload" on storage.objects;
create policy "company_assets_admin_upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'company-assets' and public.is_admin());

drop policy if exists "company_assets_admin_update" on storage.objects;
create policy "company_assets_admin_update" on storage.objects
for update to authenticated
using (bucket_id = 'company-assets' and public.is_admin())
with check (bucket_id = 'company-assets' and public.is_admin());

-- Speed improvements: indexes for common dashboard/admin/report/timetable queries.
create index if not exists idx_profiles_status_role on public.profiles(status, role);
create index if not exists idx_profiles_department_position on public.profiles(department, position);
create index if not exists idx_staff_school_staff on public.staff_school_assignments(staff_id);
create index if not exists idx_staff_school_school on public.staff_school_assignments(school_id);
create index if not exists idx_attendance_staff_date on public.attendance(staff_id, work_date desc);
create index if not exists idx_attendance_work_date_status on public.attendance(work_date desc, status);
create index if not exists idx_weekly_reports_staff_week on public.weekly_reports(staff_id, week_ending desc);
create index if not exists idx_weekly_reports_school_week on public.weekly_reports(school_id, week_ending desc);
create index if not exists idx_company_posts_archive_created on public.company_posts(archived_at, created_at desc);
create index if not exists idx_post_comments_post_created on public.post_comments(post_id, created_at);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists idx_payrolls_staff_month on public.payrolls(staff_id, month desc);
create index if not exists idx_appointment_staff_status on public.appointment_letter_requests(staff_id, status, requested_at desc);
create index if not exists idx_special_activities_staff_week on public.special_class_activities(staff_id, week_ending desc);
create index if not exists idx_workbook_orders_school_class on public.workbook_orders(school_id, class_name, created_at desc);
create index if not exists idx_workbook_supplies_school_class on public.workbook_supplies(school_id, class_name, supplied_on desc);
create index if not exists idx_student_counts_school_class on public.class_student_counts(school_id, class_name);
create index if not exists idx_staff_timetables_staff_day_time on public.staff_timetables(staff_id, day_order, start_time);
