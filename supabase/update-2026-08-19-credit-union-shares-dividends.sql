-- Add shares and dividend fields to credit union contributions.
-- Each share is GHS 200. Dividend is calculated as dividend_per_share * number_of_shares.

alter table public.credit_union_contributions
add column if not exists share_value numeric(10,2) not null default 200.00,
add column if not exists number_of_shares numeric(12,2),
add column if not exists dividend_per_share numeric(10,2) not null default 0.00,
add column if not exists dividend_amount numeric(12,2) not null default 0.00;

-- For old rows that were entered only as amount, estimate the shares from amount / 200.
update public.credit_union_contributions
set number_of_shares = round((amount / nullif(share_value, 0))::numeric, 2)
where number_of_shares is null;

-- Keep dividend total aligned where shares and dividend per share already exist.
update public.credit_union_contributions
set dividend_amount = round((coalesce(number_of_shares, 0) * coalesce(dividend_per_share, 0))::numeric, 2)
where dividend_amount is null or dividend_amount = 0;

alter table public.credit_union_contributions
alter column number_of_shares set default 0,
alter column number_of_shares set not null;

-- Allow old_record as a type for past years' entries.
alter table public.credit_union_contributions
  drop constraint if exists credit_union_contributions_contribution_type_check;

alter table public.credit_union_contributions
  add constraint credit_union_contributions_contribution_type_check
  check (contribution_type in ('monthly','old_record','top_up','adjustment'));

create index if not exists idx_credit_union_staff_shares
on public.credit_union_contributions(staff_id, contribution_month desc, number_of_shares);
