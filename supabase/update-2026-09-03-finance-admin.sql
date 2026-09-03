-- Finance Admin module tables.
-- Run this once in Supabase SQL Editor before using Admin -> Finance Admin.

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

create table if not exists public.finance_settings (
  key text primary key,
  value text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_school_billing (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  academic_year text not null default '2026/2027',
  term text not null default 'Term 1',
  student_count integer not null default 0,
  fee_type text not null default 'per_student',
  fee_per_student numeric(12,2) not null default 0,
  flat_rate numeric(12,2) not null default 0,
  books_bought integer not null default 0,
  book_unit_price numeric(12,2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_school_billing_fee_type_check check (fee_type in ('per_student', 'flat')),
  constraint finance_school_billing_term_check check (term in ('Term 1', 'Term 2', 'Term 3'))
);

create table if not exists public.finance_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  amount numeric(12,2) not null default 0,
  payment_date date not null default ((now() at time zone 'Africa/Accra')::date),
  mode text not null default 'MoMo',
  reference text,
  paid_by text,
  received_by text,
  receipt_number integer not null default 1,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_payments_mode_check check (mode in ('MoMo', 'Cash', 'Cheque', 'Bank Transfer'))
);

create table if not exists public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default ((now() at time zone 'Africa/Accra')::date),
  item text not null,
  category text not null default 'General',
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  paid_from text not null default 'Bank',
  recorded_by text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_expenses_paid_from_check check (paid_from in ('Bank', 'Cash', 'MoMo', 'Other'))
);

insert into public.finance_settings(key, value) values
  ('company_name', 'Mezzo House Limited'),
  ('address', 'Accra, Ghana'),
  ('phone', ''),
  ('email', 'mezzooffice@gmail.com'),
  ('currency', 'GHS'),
  ('receipt_prefix', 'MMA'),
  ('next_receipt_number', '1'),
  ('opening_bank_balance', '0')
on conflict (key) do nothing;

alter table public.finance_settings enable row level security;
alter table public.finance_school_billing enable row level security;
alter table public.finance_payments enable row level security;
alter table public.finance_expenses enable row level security;

drop policy if exists "finance_settings_admin_select" on public.finance_settings;
create policy "finance_settings_admin_select" on public.finance_settings
for select to authenticated
using (public.is_admin());

drop policy if exists "finance_settings_admin_all" on public.finance_settings;
create policy "finance_settings_admin_all" on public.finance_settings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "finance_billing_admin_select" on public.finance_school_billing;
create policy "finance_billing_admin_select" on public.finance_school_billing
for select to authenticated
using (public.is_admin());

drop policy if exists "finance_billing_admin_all" on public.finance_school_billing;
create policy "finance_billing_admin_all" on public.finance_school_billing
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "finance_payments_admin_select" on public.finance_payments;
create policy "finance_payments_admin_select" on public.finance_payments
for select to authenticated
using (public.is_admin());

drop policy if exists "finance_payments_admin_all" on public.finance_payments;
create policy "finance_payments_admin_all" on public.finance_payments
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "finance_expenses_admin_select" on public.finance_expenses;
create policy "finance_expenses_admin_select" on public.finance_expenses
for select to authenticated
using (public.is_admin());

drop policy if exists "finance_expenses_admin_all" on public.finance_expenses;
create policy "finance_expenses_admin_all" on public.finance_expenses
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create index if not exists idx_finance_billing_school on public.finance_school_billing(school_id);
create index if not exists idx_finance_billing_year_term on public.finance_school_billing(academic_year, term);
create index if not exists idx_finance_payments_school on public.finance_payments(school_id);
create index if not exists idx_finance_payments_date on public.finance_payments(payment_date);
create index if not exists idx_finance_expenses_date on public.finance_expenses(expense_date);
create index if not exists idx_finance_expenses_category on public.finance_expenses(category);
