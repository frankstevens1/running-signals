-- TASK: Calculate month-over-month growth in total distance.
-- Show month, total_km, previous_month_km, and growth_pct (1 decimal).
-- Only show growth_pct, not the raw values.
-- TABLE: site_runs
-- HINT: CTE with monthly totals, then LAG(total_km) OVER (ORDER BY month).
-- Growth = (current - previous) * 100.0 / NULLIF(previous, 0).

-- YOUR SOLUTION BELOW:
