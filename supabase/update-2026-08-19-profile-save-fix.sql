-- Fix staff profile saving and profile photo upload permissions.
-- Run this if staff get errors or details do not save on /profile.

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

create or replace function public.is_admin_or_supervisor()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.status, 'active') = 'active'
      and (p.role = 'admin' or p.position ilike '%supervisor%')
  );
$$;

alter table public.profiles enable row level security;

-- Staff can read their own profile. Admins/supervisors can read profiles for management views.
drop policy if exists "profiles_staff_self_select" on public.profiles;
create policy "profiles_staff_self_select" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin_or_supervisor());

-- Staff can save their own details from My Details.
drop policy if exists "profiles_staff_self_update" on public.profiles;
create policy "profiles_staff_self_update" on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- Admins can create staff records when onboarding.
drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert" on public.profiles
for insert to authenticated
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update set public = true;

-- Allow staff to upload and update only their own profile photos.
drop policy if exists "profile_photos_public_read" on storage.objects;
create policy "profile_photos_public_read" on storage.objects
for select to public
using (bucket_id = 'profile-photos');

drop policy if exists "profile_photos_staff_insert" on storage.objects;
create policy "profile_photos_staff_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_photos_staff_update" on storage.objects;
create policy "profile_photos_staff_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-photos'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
)
with check (
  bucket_id = 'profile-photos'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists "profile_photos_staff_delete" on storage.objects;
create policy "profile_photos_staff_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);