-- Allow schools to be saved before latitude and longitude are known.
-- The app can later save the school's first GPS location during a staff attendance check-in.

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

create or replace function public.can_set_missing_school_gps(p_school_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schools s
    where s.id = p_school_id
      and s.latitude is null
      and s.longitude is null
  )
  and (
    public.is_admin()
    or exists (
      select 1
      from public.staff_school_assignments a
      where a.school_id = p_school_id
        and a.staff_id = auth.uid()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.position, '') ilike '%supervisor%'
        and coalesce(p.status, 'active') = 'active'
    )
  );
$$;

alter table public.schools
alter column latitude drop not null,
alter column longitude drop not null;

alter table public.schools enable row level security;

drop policy if exists "schools_staff_set_missing_gps" on public.schools;
create policy "schools_staff_set_missing_gps" on public.schools
for update to authenticated
using (public.can_set_missing_school_gps(id))
with check (public.can_set_missing_school_gps(id) or public.is_admin());

create index if not exists idx_schools_missing_gps on public.schools(id) where latitude is null or longitude is null;
