-- Adds interest calculation and month-by-month repayment tracking for staff loans.
-- Interest formula used by the portal:
-- interest = (loan amount x interest rate) x number of repayment months
-- where interest_rate is stored as a percentage (e.g. 5 means 5%).

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.status, 'active') = 'active'
  );
$$;

alter table public.staff_loans
  add column if not exists interest_rate numeric(10,4) not null default 0,
  add column if not exists repayment_months integer,
  add column if not exists interest_amount numeric(12,2) not null default 0,
  add column if not exists total_repayable numeric(12,2),
  add column if not exists repayment_start_month date;

update public.staff_loans
set total_repayable = coalesce(total_repayable, amount + coalesce(interest_amount, 0))
where total_repayable is null;

create table if not exists public.staff_loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.staff_loans(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  repayment_month date not null,
  scheduled_amount numeric(12,2) not null default 0 check (scheduled_amount >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  paid boolean not null default false,
  paid_at timestamptz,
  notes text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_id, repayment_month)
);

alter table public.staff_loan_repayments enable row level security;

drop policy if exists "staff_loan_repayments_select" on public.staff_loan_repayments;
create policy "staff_loan_repayments_select" on public.staff_loan_repayments
for select to authenticated
using (staff_id = auth.uid() or public.is_admin());

drop policy if exists "staff_loan_repayments_admin_insert" on public.staff_loan_repayments;
create policy "staff_loan_repayments_admin_insert" on public.staff_loan_repayments
for insert to authenticated with check (public.is_admin());

drop policy if exists "staff_loan_repayments_admin_update" on public.staff_loan_repayments;
create policy "staff_loan_repayments_admin_update" on public.staff_loan_repayments
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff_loan_repayments_admin_delete" on public.staff_loan_repayments;
create policy "staff_loan_repayments_admin_delete" on public.staff_loan_repayments
for delete to authenticated using (public.is_admin());

create index if not exists idx_staff_loan_repayments_loan_month
  on public.staff_loan_repayments(loan_id, repayment_month);
create index if not exists idx_staff_loan_repayments_staff_month
  on public.staff_loan_repayments(staff_id, repayment_month desc);
