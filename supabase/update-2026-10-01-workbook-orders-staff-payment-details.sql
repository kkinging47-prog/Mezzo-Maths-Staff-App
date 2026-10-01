-- Workbook order completion tracking and staff bank/MoMo collection fields.

-- 1) Workbook order status / completion details
alter table public.workbook_orders
add column if not exists status text not null default 'pending';

alter table public.workbook_orders
add column if not exists completed_at timestamptz;

alter table public.workbook_orders
add column if not exists completed_by uuid references public.profiles(id);

alter table public.workbook_orders
add column if not exists completion_notes text;

create index if not exists idx_workbook_orders_status
on public.workbook_orders(status);

create index if not exists idx_workbook_orders_completed_at
on public.workbook_orders(completed_at)
where completed_at is not null;

-- 2) Staff bank and MoMo details
alter table public.profiles
add column if not exists bank_name text;

alter table public.profiles
add column if not exists bank_branch text;

alter table public.profiles
add column if not exists bank_account_name text;

alter table public.profiles
add column if not exists bank_account_number text;

alter table public.profiles
add column if not exists momo_network text;

alter table public.profiles
add column if not exists momo_name text;

alter table public.profiles
add column if not exists momo_number text;

create index if not exists idx_profiles_bank_collection
on public.profiles(bank_name, bank_account_number);

create index if not exists idx_profiles_momo_collection
on public.profiles(momo_network, momo_number);

-- 3) Admin helper function and RLS policies
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

-- Keep policies idempotent.
drop policy if exists "profiles_admin_read_all_staff_details" on public.profiles;
drop policy if exists "profiles_admin_update_staff_payment_details" on public.profiles;
drop policy if exists "workbook_orders_admin_update_completion" on public.workbook_orders;

-- These policies allow admins to view and update staff details directly from the new Staff Details page.
create policy "profiles_admin_read_all_staff_details"
on public.profiles
for select
to authenticated
using (public.is_admin() or id = auth.uid());

create policy "profiles_admin_update_staff_payment_details"
on public.profiles
for update
to authenticated
using (public.is_admin() or id = auth.uid())
with check (public.is_admin() or id = auth.uid());

-- Allows admins to mark workbook requests as done or reopen them.
create policy "workbook_orders_admin_update_completion"
on public.workbook_orders
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
