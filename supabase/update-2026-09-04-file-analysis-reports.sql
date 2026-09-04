-- Saved AI File Analyzer reports.
-- Run this once in Supabase SQL Editor so Admin -> File Analyzer can save, review and update analyses.

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

create table if not exists public.file_analysis_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  report_text text not null default '',
  accuracy_status text not null default 'unreviewed',
  accuracy_notes text,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint file_analysis_reports_accuracy_check check (accuracy_status in ('unreviewed', 'accurate', 'needs_correction'))
);

alter table public.file_analysis_reports enable row level security;

drop policy if exists "file_analysis_reports_admin_select" on public.file_analysis_reports;
create policy "file_analysis_reports_admin_select" on public.file_analysis_reports
for select to authenticated
using (public.is_admin());

drop policy if exists "file_analysis_reports_admin_insert" on public.file_analysis_reports;
create policy "file_analysis_reports_admin_insert" on public.file_analysis_reports
for insert to authenticated
with check (public.is_admin());

drop policy if exists "file_analysis_reports_admin_update" on public.file_analysis_reports;
create policy "file_analysis_reports_admin_update" on public.file_analysis_reports
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "file_analysis_reports_admin_delete" on public.file_analysis_reports;
create policy "file_analysis_reports_admin_delete" on public.file_analysis_reports
for delete to authenticated
using (public.is_admin());

create index if not exists idx_file_analysis_reports_updated_at on public.file_analysis_reports(updated_at desc);
create index if not exists idx_file_analysis_reports_accuracy on public.file_analysis_reports(accuracy_status);
