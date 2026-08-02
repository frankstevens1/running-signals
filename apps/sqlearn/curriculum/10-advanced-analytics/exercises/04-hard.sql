-- TASK: Calculate cumulative distance as a percentage of yearly total.
-- Show activity_date, distance_km, cumulative_km, and cumulative_pct (1 decimal) within each year.
-- Order by activity_date.
-- TABLE: site_runs
-- HINT: SUM(distance_km) OVER (PARTITION BY year ORDER BY date) / SUM(distance_km) OVER (PARTITION BY year) * 100.

-- YOUR SOLUTION BELOW:
