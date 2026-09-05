-- Prevent duplicate school assignments for the same staff member and school.
-- Teachers can still be assigned to more than one school.
-- Run this in Supabase SQL Editor.

-- 1) Remove older duplicate rows first, keeping one record for each staff + school pair.
-- Uses ctid so it still works if this table does not have an id column.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by staff_id, school_id
      order by created_at nulls last, ctid
    ) as rn
  from public.staff_school_assignments
)
delete from public.staff_school_assignments a
using ranked r
where a.ctid = r.ctid
  and r.rn > 1;

-- 2) Then add the protection so the same staff member cannot be assigned to the same school twice.
create unique index if not exists staff_school_assignments_staff_school_unique
on public.staff_school_assignments(staff_id, school_id);
