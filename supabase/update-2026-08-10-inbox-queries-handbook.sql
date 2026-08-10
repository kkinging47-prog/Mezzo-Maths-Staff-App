-- Inbox, staff queries, and company handbook support.
-- Run after the previous SQL updates.

create or replace function public.is_admin_or_supervisor_user(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = user_id
      and p.status = 'active'
      and (p.role = 'admin' or p.position ilike '%supervisor%')
  );
$$;

create table if not exists public.staff_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

alter table public.staff_messages enable row level security;

drop policy if exists "staff_messages_select" on public.staff_messages;
create policy "staff_messages_select" on public.staff_messages
for select to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "staff_messages_insert" on public.staff_messages;
create policy "staff_messages_insert" on public.staff_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
  and (
    public.is_admin_or_supervisor_user(auth.uid())
    or public.is_admin_or_supervisor_user(recipient_id)
  )
);

drop policy if exists "staff_messages_update_read" on public.staff_messages;
create policy "staff_messages_update_read" on public.staff_messages
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create table if not exists public.staff_queries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  issued_by uuid not null references public.profiles(id),
  rule_violated text not null,
  details text not null,
  action_required text,
  due_date date,
  staff_response text,
  responded_at timestamptz,
  status text not null default 'Open' check (status in ('Open','Responded','Resolved','Closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.staff_queries enable row level security;

drop policy if exists "staff_queries_select" on public.staff_queries;
create policy "staff_queries_select" on public.staff_queries
for select to authenticated
using (staff_id = auth.uid() or public.is_admin_or_supervisor_user(auth.uid()));

drop policy if exists "staff_queries_insert" on public.staff_queries;
create policy "staff_queries_insert" on public.staff_queries
for insert to authenticated
with check (issued_by = auth.uid() and public.is_admin_or_supervisor_user(auth.uid()));

drop policy if exists "staff_queries_update" on public.staff_queries;
create policy "staff_queries_update" on public.staff_queries
for update to authenticated
using (staff_id = auth.uid() or public.is_admin_or_supervisor_user(auth.uid()))
with check (staff_id = auth.uid() or public.is_admin_or_supervisor_user(auth.uid()));

-- Let users see names/emails for messaging and query recipient dropdowns.
drop policy if exists "profiles_select_message_people" on public.profiles;
create policy "profiles_select_message_people" on public.profiles
for select to authenticated
using (status = 'active' or id = auth.uid() or public.is_admin_or_supervisor_user(auth.uid()));

-- Handbook storage and settings.
insert into storage.buckets (id, name, public)
values ('company-handbook', 'company-handbook', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "company_handbook_public_read" on storage.objects;
create policy "company_handbook_public_read" on storage.objects
for select to anon, authenticated
using (bucket_id = 'company-handbook');

drop policy if exists "company_handbook_admin_upload" on storage.objects;
create policy "company_handbook_admin_upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'company-handbook' and public.is_admin());

drop policy if exists "company_handbook_admin_update" on storage.objects;
create policy "company_handbook_admin_update" on storage.objects
for update to authenticated
using (bucket_id = 'company-handbook' and public.is_admin())
with check (bucket_id = 'company-handbook' and public.is_admin());

create index if not exists idx_staff_messages_recipient_created on public.staff_messages(recipient_id, created_at desc);
create index if not exists idx_staff_messages_sender_created on public.staff_messages(sender_id, created_at desc);
create index if not exists idx_staff_queries_staff_created on public.staff_queries(staff_id, created_at desc);
create index if not exists idx_staff_queries_status_created on public.staff_queries(status, created_at desc);
