-- Attendance and timetable reminder jobs.
-- Run in Supabase SQL Editor. These jobs send inbox/real-time alerts through staff_messages.

create extension if not exists pg_cron with schema extensions;

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

create or replace function public.system_sender_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.role = 'admin'
    and coalesce(p.status, 'active') = 'active'
  order by p.created_at nulls last, p.full_name nulls last
  limit 1;
$$;

create or replace function public.send_attendance_checkin_reminders(p_reminder_time text default '08:00')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_sender uuid := public.system_sender_id();
  v_count integer := 0;
begin
  if v_sender is null then
    return 0;
  end if;

  insert into public.staff_messages(sender_id, recipient_id, subject, body)
  select
    v_sender,
    p.id,
    'Attendance check-in reminder',
    'It is ' || p_reminder_time || '. You have not checked in attendance today. Please check in with your live location and photo if you are on duty.'
  from public.profiles p
  where coalesce(p.status, 'active') = 'active'
    and coalesce(p.role, 'staff') <> 'admin'
    and not exists (
      select 1
      from public.attendance a
      where a.staff_id = p.id
        and a.work_date = v_today
        and coalesce(a.status, '') <> 'absent'
    )
    and not exists (
      select 1
      from public.staff_messages m
      where m.recipient_id = p.id
        and m.subject = 'Attendance check-in reminder'
        and m.body like '%' || p_reminder_time || '%'
        and m.created_at >= v_today::timestamptz
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.send_timetable_upload_warnings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_sender uuid := public.system_sender_id();
  v_count integer := 0;
begin
  if v_sender is null then
    return 0;
  end if;

  insert into public.staff_messages(sender_id, recipient_id, subject, body)
  select
    v_sender,
    p.id,
    'Timetable update required',
    'You have not uploaded or updated your school timetable. Please open Timetable and add your weekly school timetable so attendance and deductions can be handled correctly.'
  from public.profiles p
  where coalesce(p.status, 'active') = 'active'
    and coalesce(p.role, 'staff') <> 'admin'
    and not exists (
      select 1
      from public.staff_timetables t
      where t.staff_id = p.id
    )
    and not exists (
      select 1
      from public.staff_messages m
      where m.recipient_id = p.id
        and m.subject = 'Timetable update required'
        and m.created_at >= v_today::timestamptz
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

select cron.unschedule('mezzo-attendance-reminder-8am') where exists (select 1 from cron.job where jobname = 'mezzo-attendance-reminder-8am');
select cron.unschedule('mezzo-attendance-reminder-10am') where exists (select 1 from cron.job where jobname = 'mezzo-attendance-reminder-10am');
select cron.unschedule('mezzo-timetable-warning-8-15am') where exists (select 1 from cron.job where jobname = 'mezzo-timetable-warning-8-15am');

select cron.schedule('mezzo-attendance-reminder-8am', '0 8 * * 1-5', $$select public.send_attendance_checkin_reminders('08:00');$$);
select cron.schedule('mezzo-attendance-reminder-10am', '0 10 * * 1-5', $$select public.send_attendance_checkin_reminders('10:00');$$);
select cron.schedule('mezzo-timetable-warning-8-15am', '15 8 * * 1-5', $$select public.send_timetable_upload_warnings();$$);

grant execute on function public.send_attendance_checkin_reminders(text) to authenticated;
grant execute on function public.send_timetable_upload_warnings() to authenticated;
