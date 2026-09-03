-- Adds approval status to monthly payslips.
-- Staff will only see approved payslips. Admin can see and create all payslips.

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

alter table public.payrolls
  add column if not exists status text not null default 'approved',
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz;

alter table public.payrolls
  drop constraint if exists payrolls_status_check;

alter table public.payrolls
  add constraint payrolls_status_check
  check (status in ('draft','approved','cancelled'));

update public.payrolls
set status = 'approved'
where status is null;

alter table public.payrolls enable row level security;

drop policy if exists "payrolls_select" on public.payrolls;
create policy "payrolls_select" on public.payrolls
for select to authenticated
using (
  public.is_admin()
  or (staff_id = auth.uid() and coalesce(status, 'approved') = 'approved')
);

drop policy if exists "payrolls_admin_insert" on public.payrolls;
create policy "payrolls_admin_insert" on public.payrolls
for insert to authenticated
with check (public.is_admin());

drop policy if exists "payrolls_admin_update" on public.payrolls;
create policy "payrolls_admin_update" on public.payrolls
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "payrolls_admin_delete" on public.payrolls;
create policy "payrolls_admin_delete" on public.payrolls
for delete to authenticated
using (public.is_admin());

create index if not exists idx_payrolls_staff_month_status on public.payrolls(staff_id, month desc, status);
create index if not exists idx_payrolls_status_month on public.payrolls(status, month desc);
