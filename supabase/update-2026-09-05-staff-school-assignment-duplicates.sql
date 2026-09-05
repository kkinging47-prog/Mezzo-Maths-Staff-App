-- Prevent duplicate school assignments for the same staff member and school.
-- Teachers can still be assigned to more than one school.

create unique index if not exists staff_school_assignments_staff_school_unique
on public.staff_school_assignments(staff_id, school_id);

-- Remove older duplicate rows if they already exist, keeping the oldest record.
with ranked as (
  select
    id,
    row_number() over (partition by staff_id, school_id order by created_at nulls last, id) as rn
  from public.staff_school_assignments
)
delete from public.staff_school_assignments a
using ranked r
where a.id = r.id
  and r.rn > 1;

create unique index if not exists staff_school_assignments_staff_school_unique
on public.staff_school_assignments(staff_id, school_id);
