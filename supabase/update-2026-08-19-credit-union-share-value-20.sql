-- Correct credit union share value to GHS 20 and safely add the share/dividend columns if missing.
-- Use this even if the earlier shares/dividends SQL failed.

alter table public.credit_union_contributions
add column if not exists share_value numeric(10,2) not null default 20.00,
add column if not exists number_of_shares numeric(12,2),
add column if not exists dividend_per_share numeric(10,2) not null default 0.00,
add column if not exists dividend_amount numeric(12,2) not null default 0.00;

-- Set the correct default for all new records.
alter table public.credit_union_contributions
alter column share_value set default 20.00;

-- Existing rows entered only as amount will be converted to shares using GHS 20.
update public.credit_union_contributions
set
  share_value = 20.00,
  number_of_shares = case
    when coalesce(number_of_shares, 0) > 0 then number_of_shares
    else round((amount / 20.00)::numeric, 2)
  end,
  updated_at = now();

-- Contribution amount is always number_of_shares × GHS 20.
update public.credit_union_contributions
set
  amount = round((coalesce(number_of_shares, 0) * 20.00)::numeric, 2),
  dividend_amount = round((coalesce(number_of_shares, 0) * coalesce(dividend_per_share, 0))::numeric, 2),
  updated_at = now();

alter table public.credit_union_contributions
alter column number_of_shares set default 0,
alter column number_of_shares set not null;

alter table public.credit_union_contributions
  drop constraint if exists credit_union_contributions_contribution_type_check;

alter table public.credit_union_contributions
  add constraint credit_union_contributions_contribution_type_check
  check (contribution_type in ('monthly','old_record','top_up','adjustment'));

create index if not exists idx_credit_union_staff_shares
on public.credit_union_contributions(staff_id, contribution_month desc, number_of_shares);
