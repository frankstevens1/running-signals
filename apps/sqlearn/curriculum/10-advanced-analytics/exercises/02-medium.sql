-- TASK: Year-over-year monthly comparison: for each month, compare distance to the same month last year.
-- Show year, month, total_km, and prev_year_same_month_km. Order by year, month.
-- TABLE: site_runs
-- HINT: CTE with monthly aggregates, then LAG(total_km, 12) OVER (ORDER BY year, month).

-- YOUR SOLUTION BELOW:
