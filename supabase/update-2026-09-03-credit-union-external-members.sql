-- Allow credit union contributions for people who are not staff members.
-- Staff records still link to profiles through staff_id.
-- Non-staff credit union members use member_type = 'external' and external_name.

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

alter table public.credit_union_contributions
add column if not exists member_type text not null default 'staff',
add column if not exists external_name text;

alter table public.credit_union_contributions
alter column staff_id drop not null;

update public.credit_union_contributions
set member_type = 'staff'
where member_type is null;

alter table public.credit_union_contributions
  drop constraint if exists credit_union_contributions_member_type_check;

alter table public.credit_union_contributions
  add constraint credit_union_contributions_member_type_check
  check (member_type in ('staff','external'));

alter table public.credit_union_contributions
  drop constraint if exists credit_union_contributions_member_required_check;

alter table public.credit_union_contributions
  add constraint credit_union_contributions_member_required_check
  check (
    (member_type = 'staff' and staff_id is not null)
    or
    (member_type = 'external' and staff_id is null and nullif(trim(external_name), '') is not null)
  );

-- Make sure RLS allows staff to see only their own records, while admin can manage all records including external members.
alter table public.credit_union_contributions enable row level security;

drop policy if exists "credit_union_contributions_select" on public.credit_union_contributions;
create policy "credit_union_contributions_select" on public.credit_union_contributions
for select to authenticated
using (public.is_admin() or staff_id = auth.uid());

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

create index if not exists idx_credit_union_member_type on public.credit_union_contributions(member_type);
create index if not exists idx_credit_union_external_name on public.credit_union_contributions(external_name);
