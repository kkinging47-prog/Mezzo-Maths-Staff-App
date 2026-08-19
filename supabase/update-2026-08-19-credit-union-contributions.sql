-- Credit union contribution records.
-- Admins can record all staff contributions. Staff can see only their own records.

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

create table if not exists public.credit_union_contributions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  recorded_by uuid references public.profiles(id),
  contribution_month date not null default ((date_trunc('month', now() at time zone 'Africa/Accra'))::date),
  amount numeric(10,2) not null check (amount >= 0),
  contribution_type text not null default 'monthly' check (contribution_type in ('monthly','top_up','adjustment')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.credit_union_contributions enable row level security;

drop policy if exists "credit_union_contributions_select" on public.credit_union_contributions;
create policy "credit_union_contributions_select" on public.credit_union_contributions
for select to authenticated
using (staff_id = auth.uid() or public.is_admin());

drop policy if exists "credit_union_contributions_admin_insert" on public.credit_union_contributions;
create policy "credit_union_contributions_admin_insert" on public.credit_union_contributions
for insert to authenticated
with check (public.is_admin());

drop policy if exists "credit_union_contributions_admin_update" on public.credit_union_contributions;
create policy "credit_union_contributions_admin_update" on public.credit_union_contributions
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "credit_union_contributions_admin_delete" on public.credit_union_contributions;
create policy "credit_union_contributions_admin_delete" on public.credit_union_contributions
for delete to authenticated
using (public.is_admin());

create index if not exists idx_credit_union_staff_month on public.credit_union_contributions(staff_id, contribution_month desc);
create index if not exists idx_credit_union_month on public.credit_union_contributions(contribution_month desc);
