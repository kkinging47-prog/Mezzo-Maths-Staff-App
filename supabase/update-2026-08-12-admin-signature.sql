-- Admin signature support for generated documents.
-- Run this after the earlier company logo/settings SQL updates.

create table if not exists public.company_settings (
  key text primary key,
  value text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

alter table public.company_settings enable row level security;

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

drop policy if exists "company_settings_read_for_documents" on public.company_settings;
create policy "company_settings_read_for_documents" on public.company_settings
for select to authenticated
using (key in ('company_logo_url', 'admin_signature_url', 'admin_signature_name', 'admin_signature_data_url', 'salary_pay_date', 'current_academic_year', 'current_term') or public.is_admin());

drop policy if exists "company_settings_admin_write" on public.company_settings;
create policy "company_settings_admin_write" on public.company_settings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "company_assets_public_read" on storage.objects;
create policy "company_assets_public_read" on storage.objects
for select to public
using (bucket_id = 'company-assets');

drop policy if exists "company_assets_admin_insert" on storage.objects;
create policy "company_assets_admin_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'company-assets' and public.is_admin());

drop policy if exists "company_assets_admin_update" on storage.objects;
create policy "company_assets_admin_update" on storage.objects
for update to authenticated
using (bucket_id = 'company-assets' and public.is_admin())
with check (bucket_id = 'company-assets' and public.is_admin());

drop policy if exists "company_assets_admin_delete" on storage.objects;
create policy "company_assets_admin_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'company-assets' and public.is_admin());
