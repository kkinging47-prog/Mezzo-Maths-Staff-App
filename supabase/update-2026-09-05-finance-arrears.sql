-- Add support for previous academic year arrears and discounts on school billing.
-- Use previous_arrears for 2025/2026 balances carried into 2026/2027 Term 1 billing.
-- Use fee_discount for tuition/program fee discounts and book_discount for workbook/book discounts.

alter table public.finance_school_billing
add column if not exists previous_arrears numeric(12,2) not null default 0;

alter table public.finance_school_billing
add column if not exists fee_discount numeric(12,2) not null default 0;

alter table public.finance_school_billing
add column if not exists book_discount numeric(12,2) not null default 0;

create index if not exists idx_finance_billing_previous_arrears
on public.finance_school_billing(previous_arrears)
where previous_arrears > 0;

create index if not exists idx_finance_billing_discounts
on public.finance_school_billing(fee_discount, book_discount)
where fee_discount > 0 or book_discount > 0;

-- Optional helper view for quick school balance checks.
create or replace view public.finance_school_balances as
select
  b.school_id,
  s.name as school_name,
  sum(
    greatest(
      0,
      case
        when b.fee_type = 'flat' then coalesce(b.flat_rate, 0)
        else coalesce(b.student_count, 0) * coalesce(b.fee_per_student, 0)
      end - coalesce(b.fee_discount, 0)
    )
    + greatest(
      0,
      case when b.term = 'Term 1' then coalesce(b.books_bought, 0) * coalesce(b.book_unit_price, 0) else 0 end
      - coalesce(b.book_discount, 0)
    )
    + coalesce(b.previous_arrears, 0)
  ) as total_billed,
  sum(coalesce(b.fee_discount, 0) + coalesce(b.book_discount, 0)) as total_discounts,
  coalesce((
    select sum(p.amount)
    from public.finance_payments p
    where p.school_id = b.school_id
  ), 0) as total_paid,
  sum(
    greatest(
      0,
      case
        when b.fee_type = 'flat' then coalesce(b.flat_rate, 0)
        else coalesce(b.student_count, 0) * coalesce(b.fee_per_student, 0)
      end - coalesce(b.fee_discount, 0)
    )
    + greatest(
      0,
      case when b.term = 'Term 1' then coalesce(b.books_bought, 0) * coalesce(b.book_unit_price, 0) else 0 end
      - coalesce(b.book_discount, 0)
    )
    + coalesce(b.previous_arrears, 0)
  ) - coalesce((
    select sum(p.amount)
    from public.finance_payments p
    where p.school_id = b.school_id
  ), 0) as balance
from public.finance_school_billing b
left join public.schools s on s.id = b.school_id
group by b.school_id, s.name;