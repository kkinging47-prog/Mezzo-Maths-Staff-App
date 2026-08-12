-- Staff loans and uploaded appointment letters.
-- Run this after the earlier staff portal SQL updates.

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

create table if not exists public.staff_loans (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id),
  amount numeric(10,2) not null check (amount >= 0),
  balance numeric(10,2) not null check (balance >= 0),
  monthly_repayment numeric(10,2) check (monthly_repayment is null or monthly_repayment >= 0),
  issue_date date not null default ((now() at time zone 'Africa/Accra')::date),
  status text not null default 'active' check (status in ('active','cleared','cancelled')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.staff_loans enable row level security;

drop policy if exists "staff_loans_select" on public.staff_loans;
create policy "staff_loans_select" on public.staff_loans
for select to authenticated
using (staff_id = auth.uid() or public.is_admin());

drop policy if exists "staff_loans_admin_insert" on public.staff_loans;
create policy "staff_loans_admin_insert" on public.staff_loans
for insert to authenticated
with check (public.is_admin());

drop policy if exists "staff_loans_admin_update" on public.staff_loans;
create policy "staff_loans_admin_update" on public.staff_loans
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "staff_loans_admin_delete" on public.staff_loans;
create policy "staff_loans_admin_delete" on public.staff_loans
for delete to authenticated
using (public.is_admin());

create index if not exists idx_staff_loans_staff_date on public.staff_loans(staff_id, issue_date desc);
create index if not exists idx_staff_loans_status_date on public.staff_loans(status, issue_date desc);

create table if not exists public.appointment_letter_uploads (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  uploaded_by uuid references public.profiles(id),
  file_name text not null,
  file_path text not null,
  letter_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.appointment_letter_uploads enable row level security;

drop policy if exists "appointment_letter_uploads_select" on public.appointment_letter_uploads;
create policy "appointment_letter_uploads_select" on public.appointment_letter_uploads
for select to authenticated
using (staff_id = auth.uid() or public.is_admin());

drop policy if exists "appointment_letter_uploads_admin_insert" on public.appointment_letter_uploads;
create policy "appointment_letter_uploads_admin_insert" on public.appointment_letter_uploads
for insert to authenticated
with check (public.is_admin());

drop policy if exists "appointment_letter_uploads_admin_update" on public.appointment_letter_uploads;
create policy "appointment_letter_uploads_admin_update" on public.appointment_letter_uploads
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "appointment_letter_uploads_admin_delete" on public.appointment_letter_uploads;
create policy "appointment_letter_uploads_admin_delete" on public.appointment_letter_uploads
for delete to authenticated
using (public.is_admin());

create index if not exists idx_appointment_letter_uploads_staff_created on public.appointment_letter_uploads(staff_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('appointment-letters', 'appointment-letters', false)
on conflict (id) do update set public = false;

drop policy if exists "appointment_letters_select" on storage.objects;
create policy "appointment_letters_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'appointment-letters'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "appointment_letters_admin_insert" on storage.objects;
create policy "appointment_letters_admin_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'appointment-letters' and public.is_admin());

drop policy if exists "appointment_letters_admin_update" on storage.objects;
create policy "appointment_letters_admin_update" on storage.objects
for update to authenticated
using (bucket_id = 'appointment-letters' and public.is_admin())
with check (bucket_id = 'appointment-letters' and public.is_admin());

drop policy if exists "appointment_letters_admin_delete" on storage.objects;
create policy "appointment_letters_admin_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'appointment-letters' and public.is_admin());
