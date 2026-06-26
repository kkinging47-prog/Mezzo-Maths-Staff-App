-- Optional patch: make new records use the current academic year and term settings.
-- Run after update-2026-2027-term-birthday-points.sql.

alter table public.attendance alter column academic_year set default public.current_academic_year();
alter table public.attendance alter column term set default public.current_term();
alter table public.weekly_reports alter column academic_year set default public.current_academic_year();
alter table public.weekly_reports alter column term set default public.current_term();
alter table public.special_class_activities alter column academic_year set default public.current_academic_year();
alter table public.special_class_activities alter column term set default public.current_term();
alter table public.workbook_orders alter column academic_year set default public.current_academic_year();
alter table public.workbook_orders alter column term set default public.current_term();
alter table public.workbook_supplies alter column academic_year set default public.current_academic_year();
alter table public.workbook_supplies alter column term set default public.current_term();
alter table public.class_student_counts alter column academic_year set default public.current_academic_year();
alter table public.class_student_counts alter column term set default public.current_term();
alter table public.staff_timetables alter column academic_year set default public.current_academic_year();
alter table public.staff_timetables alter column term set default public.current_term();
alter table public.staff_points alter column academic_year set default public.current_academic_year();
alter table public.staff_points alter column term set default public.current_term();
