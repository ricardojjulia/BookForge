-- Publisher's original seed price ($199, see 202608200001_subscription_tiers.sql)
-- left only a ~9.5% margin floor at 100% credit-cap usage -- flagged as thin in
-- the original tier cost analysis but deliberately not silently accepted.
--
-- Resolved by raising price rather than tightening the credit cap: Publisher is
-- the one tier explicitly meant to absorb agency-scale usage spikes without a
-- subscriber hitting a wall mid-project (5 seats, priority queue), so its ~1.9x
-- typical-cost buffer (monthly_credit_cap_usd_micros, unchanged here) matters
-- more here than on the other tiers -- shrinking it would fix the margin number
-- at the cost of the exact protection this tier is supposed to provide.
--
-- $219/mo keeps the cap at its original $180 and raises the floor margin to
-- ~17.8% (worst case) / ~56.2% (typical), still the thinnest of the four tiers
-- by design (highest usage, highest cost exposure) but no longer alarmingly so.
update public.subscription_tiers
set monthly_price_usd_cents = 21900, updated_at = now()
where id = 'publisher';
