-- Correct credit union share value from GHS 200 to GHS 20.
-- Run this after the credit union shares/dividends SQL if it has already been run.

alter table public.credit_union_contributions
alter column share_value set default 20.00;

-- For entries saved while the app was using GHS 200 per share, correct the share value and contribution amount.
-- The number of shares remains the same; amount becomes number_of_shares * 20.
update public.credit_union_contributions
set
  share_value = 20.00,
  amount = round((coalesce(number_of_shares, 0) * 20.00)::numeric, 2),
  dividend_amount = round((coalesce(number_of_shares, 0) * coalesce(dividend_per_share, 0))::numeric, 2),
  updated_at = now()
where share_value = 200.00;
