-- Enable Supabase Realtime for staff portal notifications.
-- Run this once in Supabase SQL Editor, then redeploy/refresh the app.
-- Without this, browser subscriptions may connect but no phone/app notification event is delivered.

create or replace function public.enable_realtime_for_table(p_table regclass)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format('alter table %s replica identity full', p_table);
  begin
    execute format('alter publication supabase_realtime add table %s', p_table);
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;

do $$
begin
  if to_regclass('public.staff_messages') is not null then
    perform public.enable_realtime_for_table('public.staff_messages'::regclass);
  end if;
  if to_regclass('public.staff_queries') is not null then
    perform public.enable_realtime_for_table('public.staff_queries'::regclass);
  end if;
  if to_regclass('public.attendance_deductions') is not null then
    perform public.enable_realtime_for_table('public.attendance_deductions'::regclass);
  end if;
  if to_regclass('public.company_posts') is not null then
    perform public.enable_realtime_for_table('public.company_posts'::regclass);
  end if;
  if to_regclass('public.post_comments') is not null then
    perform public.enable_realtime_for_table('public.post_comments'::regclass);
  end if;
  if to_regclass('public.meetings') is not null then
    perform public.enable_realtime_for_table('public.meetings'::regclass);
  end if;
end;
$$;

-- Keep the helper available for future notification tables.
grant execute on function public.enable_realtime_for_table(regclass) to authenticated;
