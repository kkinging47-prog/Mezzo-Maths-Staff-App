-- Marketing records for school visits, proposals and presentations.
-- Run after the previous SQL updates.

create table if not exists public.marketing_records (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  school_name text not null,
  location text not null,
  contact_person text not null,
  contact_phone text,
  status text not null check (status in ('Prospect identified', 'Proposal submitted', 'Presentation done', 'Follow-up needed', 'Interested', 'Not interested', 'Signed / Converted')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.marketing_records enable row level security;

create or replace function public.can_view_all_marketing()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role = 'admin'
        or p.position ilike '%marketer%'
        or p.position ilike '%marketing%'
        or p.position ilike '%office staff%'
        or p.position ilike '%administration%'
        or p.department ilike '%marketing%'
        or p.department ilike '%administration%'
        or p.department ilike '%human resource%'
      )
  );
$$;

drop policy if exists "marketing_records_select" on public.marketing_records;
create policy "marketing_records_select" on public.marketing_records
for select to authenticated
using (staff_id = auth.uid() or public.can_view_all_marketing());

drop policy if exists "marketing_records_insert" on public.marketing_records;
create policy "marketing_records_insert" on public.marketing_records
for insert to authenticated
with check (staff_id = auth.uid());

drop policy if exists "marketing_records_update" on public.marketing_records;
create policy "marketing_records_update" on public.marketing_records
for update to authenticated
using (staff_id = auth.uid() or public.can_view_all_marketing())
with check (staff_id = auth.uid() or public.can_view_all_marketing());

create index if not exists idx_marketing_records_staff_created on public.marketing_records(staff_id, created_at desc);
create index if not exists idx_marketing_records_status_created on public.marketing_records(status, created_at desc);
create index if not exists idx_marketing_records_school_name on public.marketing_records(school_name);
