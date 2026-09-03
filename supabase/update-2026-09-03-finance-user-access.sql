-- Finance user access.
-- Run after supabase/update-2026-09-03-finance-admin.sql.
-- This lets admin give finance-only access without making a person a full app admin.

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

create table if not exists public.finance_user_access (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  access_level text not null default 'finance_admin',
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_user_access_level_check check (access_level in ('finance_admin', 'finance_viewer')),
  constraint finance_user_access_profile_unique unique (profile_id)
);

create or replace function public.has_finance_access(required_level text default 'finance_viewer')
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.finance_user_access fua
      join public.profiles p on p.id = fua.profile_id
      where fua.profile_id = auth.uid()
        and fua.active = true
        and coalesce(p.status, 'active') = 'active'
        and (
          required_level = 'finance_viewer'
          or fua.access_level = 'finance_admin'
        )
    );
$$;

alter table public.finance_user_access enable row level security;

drop policy if exists "finance_user_access_admin_select" on public.finance_user_access;
create policy "finance_user_access_admin_select" on public.finance_user_access
for select to authenticated
using (public.is_admin() or profile_id = auth.uid());

drop policy if exists "finance_user_access_admin_all" on public.finance_user_access;
create policy "finance_user_access_admin_all" on public.finance_user_access
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Replace finance module policies so finance viewers can read, finance admins can write.

drop policy if exists "finance_settings_admin_select" on public.finance_settings;
drop policy if exists "finance_settings_admin_all" on public.finance_settings;
create policy "finance_settings_finance_select" on public.finance_settings
for select to authenticated
using (public.has_finance_access('finance_viewer'));
create policy "finance_settings_finance_all" on public.finance_settings
for all to authenticated
using (public.has_finance_access('finance_admin'))
with check (public.has_finance_access('finance_admin'));

drop policy if exists "finance_billing_admin_select" on public.finance_school_billing;
drop policy if exists "finance_billing_admin_all" on public.finance_school_billing;
create policy "finance_billing_finance_select" on public.finance_school_billing
for select to authenticated
using (public.has_finance_access('finance_viewer'));
create policy "finance_billing_finance_all" on public.finance_school_billing
for all to authenticated
using (public.has_finance_access('finance_admin'))
with check (public.has_finance_access('finance_admin'));

drop policy if exists "finance_payments_admin_select" on public.finance_payments;
drop policy if exists "finance_payments_admin_all" on public.finance_payments;
create policy "finance_payments_finance_select" on public.finance_payments
for select to authenticated
using (public.has_finance_access('finance_viewer'));
create policy "finance_payments_finance_all" on public.finance_payments
for all to authenticated
using (public.has_finance_access('finance_admin'))
with check (public.has_finance_access('finance_admin'));

drop policy if exists "finance_expenses_admin_select" on public.finance_expenses;
drop policy if exists "finance_expenses_admin_all" on public.finance_expenses;
create policy "finance_expenses_finance_select" on public.finance_expenses
for select to authenticated
using (public.has_finance_access('finance_viewer'));
create policy "finance_expenses_finance_all" on public.finance_expenses
for all to authenticated
using (public.has_finance_access('finance_admin'))
with check (public.has_finance_access('finance_admin'));

create index if not exists idx_finance_user_access_profile on public.finance_user_access(profile_id);
create index if not exists idx_finance_user_access_active on public.finance_user_access(active);
