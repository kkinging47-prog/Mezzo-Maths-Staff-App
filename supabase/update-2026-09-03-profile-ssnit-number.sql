-- Adds SSNIT number field to staff profiles for automatic payslip deductions.
-- Run this once in Supabase SQL Editor, then redeploy the app.

alter table public.profiles
  add column if not exists ssnit_number text;

create index if not exists idx_profiles_ssnit_number on public.profiles(ssnit_number)
where ssnit_number is not null and trim(ssnit_number) <> '';
