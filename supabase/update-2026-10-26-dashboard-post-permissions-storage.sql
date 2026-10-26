-- Repair tutor dashboard posts and image uploads for the Mezzo Staff Portal.
-- Apply to the Supabase project configured by VITE_SUPABASE_URL for staff.mezzomaths.org.
-- Safe to run more than once. Does not delete existing posts or images.

-- The frontend uses getPublicUrl() for dashboard photos.
insert into storage.buckets (id, name, public)
values ('dashboard-posts', 'dashboard-posts', true)
on conflict (id) do update set public = true;

-- Posts must be authored by the signed-in staff member.
-- Only active administrators, tutors and teachers can publish.
alter table public.company_posts enable row level security;
grant select, insert on public.company_posts to authenticated;

drop policy if exists "posts_teacher_insert" on public.company_posts;
create policy "posts_teacher_insert"
on public.company_posts
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and post_type = 'teacher_post'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(trim(coalesce(p.status, 'active'))) = 'active'
      and (
        p.role = 'admin'
        or coalesce(p.position, '') ilike '%teacher%'
        or coalesce(p.position, '') ilike '%tutor%'
        or coalesce(p.department, '') ilike '%teaching%'
      )
  )
);

-- Each teacher may upload only into their own user-ID folder.
drop policy if exists "dashboard_posts_teacher_upload" on storage.objects;
create policy "dashboard_posts_teacher_upload"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'dashboard-posts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(trim(coalesce(p.status, 'active'))) = 'active'
      and (
        p.role = 'admin'
        or coalesce(p.position, '') ilike '%teacher%'
        or coalesce(p.position, '') ilike '%tutor%'
        or coalesce(p.department, '') ilike '%teaching%'
      )
  )
);

-- Images linked in staff dashboard posts need public read access.
drop policy if exists "dashboard_posts_public_read" on storage.objects;
create policy "dashboard_posts_public_read"
on storage.objects
for select to anon, authenticated
using (bucket_id = 'dashboard-posts');

-- Useful verification after running:
-- select id, name, public from storage.buckets where id = 'dashboard-posts';
-- select policyname, cmd from pg_policies
--  where (schemaname='public' and tablename='company_posts')
--     or (schemaname='storage' and tablename='objects');
