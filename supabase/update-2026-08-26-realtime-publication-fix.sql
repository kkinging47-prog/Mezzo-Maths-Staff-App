-- Realtime publication fix for Mezzo Staff App notifications.
-- Run this when the app prompts for a realtime SQL fix.
-- It enables Supabase realtime events for the tables used by the staff portal notifications.

begin;

-- Ensure realtime can publish row changes for these tables.
alter table if exists public.company_posts replica identity full;
alter table if exists public.staff_messages replica identity full;
alter table if exists public.staff_queries replica identity full;
alter table if exists public.attendance_deductions replica identity full;
alter table if exists public.meetings replica identity full;
alter table if exists public.post_comments replica identity full;
alter table if exists public.credit_union_contributions replica identity full;

-- Add tables to the Supabase realtime publication.
-- Duplicate-object errors are ignored so the script can be run safely more than once.
do $$
begin
  begin alter publication supabase_realtime add table public.company_posts; exception when duplicate_object then null; when undefined_table then null; end;
  begin alter publication supabase_realtime add table public.staff_messages; exception when duplicate_object then null; when undefined_table then null; end;
  begin alter publication supabase_realtime add table public.staff_queries; exception when duplicate_object then null; when undefined_table then null; end;
  begin alter publication supabase_realtime add table public.attendance_deductions; exception when duplicate_object then null; when undefined_table then null; end;
  begin alter publication supabase_realtime add table public.meetings; exception when duplicate_object then null; when undefined_table then null; end;
  begin alter publication supabase_realtime add table public.post_comments; exception when duplicate_object then null; when undefined_table then null; end;
  begin alter publication supabase_realtime add table public.credit_union_contributions; exception when duplicate_object then null; when undefined_table then null; end;
end $$;

commit;

-- Optional check: this should list the realtime-enabled tables.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'company_posts',
    'staff_messages',
    'staff_queries',
    'attendance_deductions',
    'meetings',
    'post_comments',
    'credit_union_contributions'
  )
order by tablename;
