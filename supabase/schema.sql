-- Mezzo Staff Portal Supabase Schema
-- Run this in Supabase SQL Editor after creating your project.
-- Then create the first admin user in Auth, and update that user's role to admin.

create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- Staff profiles linked to Supabase Auth users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('admin','staff')),
  staff_no text unique,
  full_name text,
  date_of_birth date,
  date_employed date,
  email text unique,
  phone text,
  location text,
  digital_address text,
  home_address text,
  guardian_name text,
  guardian_contact text,
  position text default 'Teacher',
  department text,
  photo_url text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null default 100,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.staff_school_assignments (
  staff_id uuid references public.profiles(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  primary key (staff_id, school_id)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  work_date date not null default ((now() at time zone 'Africa/Accra')::date),
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  check_in_lat double precision,
  check_in_lng double precision,
  check_out_lat double precision,
  check_out_lng double precision,
  check_in_distance_m integer,
  check_out_distance_m integer,
  selfie_url text,
  status text not null default 'checked_in' check (status in ('checked_in','checked_out','auto_checked_out','outside_range')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (staff_id, school_id, work_date)
);

create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  week_ending date not null,
  classes_taught text[] not null default '{}',
  topics_covered text not null,
  challenges_observed text,
  notable_observations text,
  recommendations text,
  comments text,
  submitted_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.company_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  title text not null,
  body text not null,
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  post_type text not null default 'update' check (post_type in ('update','birthday')),
  image_url text,
  image_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Safe upgrades for existing projects that already ran an older schema.
alter table public.company_posts add column if not exists post_type text not null default 'update';
alter table public.company_posts add column if not exists image_url text;
alter table public.company_posts add column if not exists image_path text;

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.company_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.company_posts(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  room_name text not null unique,
  scheduled_at timestamptz,
  created_by uuid references public.profiles(id),
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.payrolls (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  month date not null,
  basic_salary numeric(12,2) not null default 0,
  allowances numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  paid_on date,
  created_at timestamptz default now(),
  unique (staff_id, month)
);

-- Auto-create profile after a Supabase Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Helper used by RLS policies.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Auto checkout all open attendance at 4pm Ghana time.
create or replace function public.auto_checkout_attendance()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.attendance
  set check_out_at = (work_date::timestamp + time '16:00') at time zone 'Africa/Accra',
      status = 'auto_checked_out',
      updated_at = now()
  where check_out_at is null
    and work_date <= ((now() at time zone 'Africa/Accra')::date);
end;
$$;

-- Create notifications for every staff member when admin posts an update.
create or replace function public.create_update_notifications()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notifications (user_id, post_id, title, body)
  select id, new.id, new.title, left(new.body, 160)
  from public.profiles
  where status = 'active';
  return new;
end;
$$;

drop trigger if exists company_post_notifications on public.company_posts;
create trigger company_post_notifications
after insert on public.company_posts
for each row execute function public.create_update_notifications();

-- Storage buckets
insert into storage.buckets (id, name, public) values ('attendance-selfies', 'attendance-selfies', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('profile-photos', 'profile-photos', true) on conflict (id) do update set public = excluded.public;
insert into storage.buckets (id, name, public) values ('birthday-cards', 'birthday-cards', true) on conflict (id) do update set public = excluded.public;

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.staff_school_assignments enable row level security;
alter table public.attendance enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.company_posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.meetings enable row level security;
alter table public.payrolls enable row level security;

-- Policies: profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles for insert to authenticated with check (public.is_admin());

-- Policies: schools
drop policy if exists "schools_select_authenticated" on public.schools;
create policy "schools_select_authenticated" on public.schools for select to authenticated using (true);
drop policy if exists "schools_admin_all" on public.schools;
create policy "schools_admin_all" on public.schools for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Policies: assignments
drop policy if exists "assignments_select_own_or_admin" on public.staff_school_assignments;
create policy "assignments_select_own_or_admin" on public.staff_school_assignments for select to authenticated using (staff_id = auth.uid() or public.is_admin());
drop policy if exists "assignments_admin_all" on public.staff_school_assignments;
create policy "assignments_admin_all" on public.staff_school_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Policies: attendance
drop policy if exists "attendance_select_own_or_admin" on public.attendance;
create policy "attendance_select_own_or_admin" on public.attendance for select to authenticated using (staff_id = auth.uid() or public.is_admin());
drop policy if exists "attendance_insert_own" on public.attendance;
create policy "attendance_insert_own" on public.attendance for insert to authenticated with check (staff_id = auth.uid());
drop policy if exists "attendance_update_own_or_admin" on public.attendance;
create policy "attendance_update_own_or_admin" on public.attendance for update to authenticated using (staff_id = auth.uid() or public.is_admin()) with check (staff_id = auth.uid() or public.is_admin());

-- Policies: reports
drop policy if exists "reports_select_own_or_admin" on public.weekly_reports;
create policy "reports_select_own_or_admin" on public.weekly_reports for select to authenticated using (staff_id = auth.uid() or public.is_admin());
drop policy if exists "reports_insert_own" on public.weekly_reports;
create policy "reports_insert_own" on public.weekly_reports for insert to authenticated with check (staff_id = auth.uid());
drop policy if exists "reports_update_own_or_admin" on public.weekly_reports;
create policy "reports_update_own_or_admin" on public.weekly_reports for update to authenticated using (staff_id = auth.uid() or public.is_admin()) with check (staff_id = auth.uid() or public.is_admin());

-- Policies: posts and comments
drop policy if exists "posts_select_all" on public.company_posts;
create policy "posts_select_all" on public.company_posts for select to authenticated using (true);
drop policy if exists "posts_admin_all" on public.company_posts;
create policy "posts_admin_all" on public.company_posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "comments_select_all" on public.post_comments;
create policy "comments_select_all" on public.post_comments for select to authenticated using (true);
drop policy if exists "comments_insert_auth" on public.post_comments;
create policy "comments_insert_auth" on public.post_comments for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "comments_update_own_or_admin" on public.post_comments;
create policy "comments_update_own_or_admin" on public.post_comments for update to authenticated using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());

-- Policies: notifications
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated using (user_id = auth.uid() or user_id is null or public.is_admin());
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

-- Policies: meetings
drop policy if exists "meetings_select_all" on public.meetings;
create policy "meetings_select_all" on public.meetings for select to authenticated using (true);
drop policy if exists "meetings_admin_all" on public.meetings;
create policy "meetings_admin_all" on public.meetings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Policies: payrolls
drop policy if exists "payrolls_select_own_or_admin" on public.payrolls;
create policy "payrolls_select_own_or_admin" on public.payrolls for select to authenticated using (staff_id = auth.uid() or public.is_admin());
drop policy if exists "payrolls_admin_all" on public.payrolls;
create policy "payrolls_admin_all" on public.payrolls for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Storage policy for attendance selfies. Staff upload only into their own folder.
drop policy if exists "selfie_upload_own_folder" on storage.objects;
create policy "selfie_upload_own_folder" on storage.objects for insert to authenticated with check (bucket_id = 'attendance-selfies' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "selfie_read_authenticated" on storage.objects;
create policy "selfie_read_authenticated" on storage.objects for select to authenticated using (bucket_id = 'attendance-selfies');

-- Storage policies for profile photos. Staff can upload/update inside their own folder.
drop policy if exists "profile_photos_upload_own_folder" on storage.objects;
create policy "profile_photos_upload_own_folder" on storage.objects for insert to authenticated with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "profile_photos_update_own_folder" on storage.objects;
create policy "profile_photos_update_own_folder" on storage.objects for update to authenticated using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "profile_photos_read_authenticated" on storage.objects;
create policy "profile_photos_read_authenticated" on storage.objects for select to authenticated using (bucket_id = 'profile-photos');

-- Storage policies for birthday cards. Only admins can create cards; authenticated staff can read them.
drop policy if exists "birthday_cards_admin_upload" on storage.objects;
create policy "birthday_cards_admin_upload" on storage.objects for insert to authenticated with check (bucket_id = 'birthday-cards' and public.is_admin());
drop policy if exists "birthday_cards_read_authenticated" on storage.objects;
create policy "birthday_cards_read_authenticated" on storage.objects for select to authenticated using (bucket_id = 'birthday-cards');

-- Schedule: Ghana is UTC, so 16:00 is exactly 4:00pm Ghana time. Run every day.
-- This block safely replaces any existing job with the same name.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-close-attendance-4pm-ghana') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'auto-close-attendance-4pm-ghana';
  end if;

  perform cron.schedule(
    'auto-close-attendance-4pm-ghana',
    '0 16 * * *',
    $cron$select public.auto_checkout_attendance();$cron$
  );
end;
$$;

-- After creating the first admin user in Auth, run this with the user's email:
-- update public.profiles set role = 'admin', full_name = 'Admin Name' where email = 'admin@example.com';
