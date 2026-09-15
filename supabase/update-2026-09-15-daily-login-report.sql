-- Daily login tracking for staff.
-- This table allows admin to see who logged in and who did not log in each day.

create table if not exists public.staff_login_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  login_date date not null default current_date,
  login_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, login_date)
);

alter table public.staff_login_logs enable row level security;

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
  );
$$;

drop policy if exists "staff_login_logs_admin_select" on public.staff_login_logs;
drop policy if exists "staff_login_logs_own_select" on public.staff_login_logs;
drop policy if exists "staff_login_logs_own_insert" on public.staff_login_logs;
drop policy if exists "staff_login_logs_own_update" on public.staff_login_logs;

create policy "staff_login_logs_admin_select"
on public.staff_login_logs
for select
to authenticated
using (public.is_admin());

create policy "staff_login_logs_own_select"
on public.staff_login_logs
for select
to authenticated
using (staff_id = auth.uid());

create policy "staff_login_logs_own_insert"
on public.staff_login_logs
for insert
to authenticated
with check (staff_id = auth.uid());

create policy "staff_login_logs_own_update"
on public.staff_login_logs
for update
to authenticated
using (staff_id = auth.uid())
with check (staff_id = auth.uid());

create index if not exists idx_staff_login_logs_date
on public.staff_login_logs(login_date);

create index if not exists idx_staff_login_logs_staff_date
on public.staff_login_logs(staff_id, login_date);
