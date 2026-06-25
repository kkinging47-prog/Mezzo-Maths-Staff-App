-- Staff portal next-features update. Run after the main schema.sql.
create extension if not exists "pg_cron";

-- Staff statuses and departments
alter table public.profiles add column if not exists status text default 'active';
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('active','left'));

-- Dashboard archives and salary settings
alter table public.company_posts add column if not exists archived_at timestamptz;
create table if not exists public.company_settings (
  key text primary key,
  value text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

-- Appointment/signing documents
create table if not exists public.binding_agreements (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references public.profiles(id) on delete cascade,
  signed_name text not null,
  signed_at timestamptz not null default now(),
  created_at timestamptz default now()
);

-- Attendance absent status support
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check check (status in ('checked_in','checked_out','auto_checked_out','outside_range','absent'));

-- Special class activities
create table if not exists public.special_class_activities (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  week_ending date not null,
  title text not null,
  details text not null,
  photo_urls text[] default '{}',
  created_at timestamptz default now()
);

-- Workbook orders/supplies/student counts
create table if not exists public.workbook_orders (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  class_name text not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'requested' check (status in ('requested','supplied','cancelled')),
  created_at timestamptz default now()
);
create table if not exists public.workbook_supplies (
  id uuid primary key default gen_random_uuid(),
  posted_by uuid references public.profiles(id),
  school_id uuid not null references public.schools(id),
  class_name text not null,
  quantity integer not null check (quantity > 0),
  supplied_on date not null default ((now() at time zone 'Africa/Accra')::date),
  created_at timestamptz default now()
);
create table if not exists public.class_student_counts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  class_name text not null,
  student_count integer not null check (student_count >= 0),
  updated_at timestamptz default now(),
  unique (staff_id, school_id, class_name)
);

-- Image bucket for special activities
insert into storage.buckets (id, name, public) values ('activity-photos', 'activity-photos', true) on conflict (id) do update set public = excluded.public;

-- Enable RLS
alter table public.company_settings enable row level security;
alter table public.binding_agreements enable row level security;
alter table public.special_class_activities enable row level security;
alter table public.workbook_orders enable row level security;
alter table public.workbook_supplies enable row level security;
alter table public.class_student_counts enable row level security;

-- Attendance visible for dashboard scores
drop policy if exists "attendance_select_own_or_admin" on public.attendance;
create policy "attendance_select_dashboard" on public.attendance for select to authenticated using (true);

-- Settings policies
drop policy if exists "settings_select_all" on public.company_settings;
create policy "settings_select_all" on public.company_settings for select to authenticated using (true);
drop policy if exists "settings_admin_all" on public.company_settings;
create policy "settings_admin_all" on public.company_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Binding agreement policies
drop policy if exists "binding_select_own_or_admin" on public.binding_agreements;
create policy "binding_select_own_or_admin" on public.binding_agreements for select to authenticated using (staff_id = auth.uid() or public.is_admin());
drop policy if exists "binding_insert_own" on public.binding_agreements;
create policy "binding_insert_own" on public.binding_agreements for insert to authenticated with check (staff_id = auth.uid());
drop policy if exists "binding_update_own" on public.binding_agreements;
create policy "binding_update_own" on public.binding_agreements for update to authenticated using (staff_id = auth.uid() or public.is_admin()) with check (staff_id = auth.uid() or public.is_admin());

-- Special activities policies
drop policy if exists "activities_select_all" on public.special_class_activities;
create policy "activities_select_all" on public.special_class_activities for select to authenticated using (true);
drop policy if exists "activities_insert_own" on public.special_class_activities;
create policy "activities_insert_own" on public.special_class_activities for insert to authenticated with check (staff_id = auth.uid());
drop policy if exists "activities_admin_all" on public.special_class_activities;
create policy "activities_admin_all" on public.special_class_activities for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Workbook policies
create policy "workbook_orders_select_all" on public.workbook_orders for select to authenticated using (true);
create policy "workbook_orders_insert_own" on public.workbook_orders for insert to authenticated with check (staff_id = auth.uid());
create policy "workbook_orders_admin_all" on public.workbook_orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "workbook_supplies_select_all" on public.workbook_supplies for select to authenticated using (true);
create policy "workbook_supplies_admin_insert" on public.workbook_supplies for insert to authenticated with check (public.is_admin());
create policy "workbook_supplies_admin_all" on public.workbook_supplies for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "student_counts_select_all" on public.class_student_counts for select to authenticated using (true);
create policy "student_counts_insert_own" on public.class_student_counts for insert to authenticated with check (staff_id = auth.uid());
create policy "student_counts_update_own_or_admin" on public.class_student_counts for update to authenticated using (staff_id = auth.uid() or public.is_admin()) with check (staff_id = auth.uid() or public.is_admin());

-- Storage policies for activity photos
create policy "activity_photos_upload_own" on storage.objects for insert to authenticated with check (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "activity_photos_read_all" on storage.objects for select to authenticated using (bucket_id = 'activity-photos');

-- Notify staff every 2 hours before 2pm if they have not checked in; mark absent at 2pm.
create or replace function public.attendance_reminders_and_absences()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  today date := ((now() at time zone 'Africa/Accra')::date);
  hour_now int := extract(hour from (now() at time zone 'Africa/Accra'))::int;
begin
  if hour_now in (8,10,12) then
    insert into public.notifications (user_id, title, body)
    select p.id, 'Attendance reminder', 'Please check in before 2:00pm if you are reporting to school today.'
    from public.profiles p
    where p.status = 'active'
      and p.role = 'staff'
      and not exists (select 1 from public.attendance a where a.staff_id = p.id and a.work_date = today)
      and not exists (select 1 from public.notifications n where n.user_id = p.id and n.title = 'Attendance reminder' and n.created_at::date = today and extract(hour from n.created_at at time zone 'Africa/Accra')::int = hour_now);
  end if;

  if hour_now >= 14 then
    insert into public.attendance (staff_id, school_id, work_date, check_in_at, check_out_at, status, notes)
    select p.id, min(a.school_id), today, (today::timestamp + time '14:00') at time zone 'Africa/Accra', (today::timestamp + time '14:00') at time zone 'Africa/Accra', 'absent', 'Auto-marked absent for no check-in before 2pm.'
    from public.profiles p
    join public.staff_school_assignments a on a.staff_id = p.id
    where p.status = 'active' and p.role = 'staff'
      and not exists (select 1 from public.attendance att where att.staff_id = p.id and att.work_date = today)
    group by p.id
    on conflict do nothing;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'attendance-reminders-absences') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'attendance-reminders-absences';
  end if;
  perform cron.schedule('attendance-reminders-absences', '0 8,10,12,14 * * 1-5', $cron$select public.attendance_reminders_and_absences();$cron$);
end;
$$;
