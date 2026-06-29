-- Teacher dashboard posting and sharing support.
-- Run after the previous SQL updates.

insert into storage.buckets (id, name, public)
values ('dashboard-posts', 'dashboard-posts', true)
on conflict (id) do update set public = excluded.public;

-- Teachers/tutors can post normal dashboard updates. Admin policies still apply separately.
drop policy if exists "posts_teacher_insert" on public.company_posts;
create policy "posts_teacher_insert" on public.company_posts
for insert to authenticated
with check (
  author_id = auth.uid()
  and post_type in ('teacher_post', 'update')
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role = 'admin'
        or p.position ilike '%tutor%'
        or p.position ilike '%teacher%'
        or p.department ilike '%teaching%'
      )
  )
);

drop policy if exists "dashboard_posts_public_read" on storage.objects;
create policy "dashboard_posts_public_read" on storage.objects
for select to anon, authenticated
using (bucket_id = 'dashboard-posts');

drop policy if exists "dashboard_posts_teacher_upload" on storage.objects;
create policy "dashboard_posts_teacher_upload" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'dashboard-posts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role = 'admin'
        or p.position ilike '%tutor%'
        or p.position ilike '%teacher%'
        or p.department ilike '%teaching%'
      )
  )
);

create index if not exists idx_company_posts_post_type_created on public.company_posts(post_type, created_at desc);
