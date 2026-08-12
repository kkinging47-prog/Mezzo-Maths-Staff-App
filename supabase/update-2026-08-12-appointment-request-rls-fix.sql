-- Fix RLS error: new row violates row-level security policy for appointment_letter_requests.
-- Staff can request their own appointment letter. Admins can view and approve all requests.

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

alter table public.appointment_letter_requests enable row level security;

drop policy if exists "appointment_letter_requests_select" on public.appointment_letter_requests;
create policy "appointment_letter_requests_select" on public.appointment_letter_requests
for select to authenticated
using (staff_id = auth.uid() or public.is_admin());

drop policy if exists "appointment_letter_requests_staff_insert" on public.appointment_letter_requests;
create policy "appointment_letter_requests_staff_insert" on public.appointment_letter_requests
for insert to authenticated
with check (staff_id = auth.uid() or public.is_admin());

drop policy if exists "appointment_letter_requests_admin_update" on public.appointment_letter_requests;
create policy "appointment_letter_requests_admin_update" on public.appointment_letter_requests
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "appointment_letter_requests_admin_delete" on public.appointment_letter_requests;
create policy "appointment_letter_requests_admin_delete" on public.appointment_letter_requests
for delete to authenticated
using (public.is_admin());

create index if not exists idx_appointment_letter_requests_staff_requested
on public.appointment_letter_requests(staff_id, requested_at desc);
