-- Final policy fixes for the 25 June staff portal update. Run after update-2026-06-25-next-features.sql.

-- Staff special class activities also create dashboard posts.
drop policy if exists "posts_staff_activity_insert" on public.company_posts;
create policy "posts_staff_activity_insert" on public.company_posts
for insert to authenticated
with check (author_id = auth.uid() and post_type = 'update');

-- Make the dashboard attendance scores visible to authenticated staff.
drop policy if exists "attendance_select_dashboard" on public.attendance;
create policy "attendance_select_dashboard" on public.attendance for select to authenticated using (true);

-- Allow staff to upload activity photos and everyone signed in to view them.
drop policy if exists "activity_photos_upload_own" on storage.objects;
create policy "activity_photos_upload_own" on storage.objects for insert to authenticated with check (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "activity_photos_read_all" on storage.objects;
create policy "activity_photos_read_all" on storage.objects for select to authenticated using (bucket_id = 'activity-photos');
