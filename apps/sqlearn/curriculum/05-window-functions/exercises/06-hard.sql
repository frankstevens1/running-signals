-- TASK: Calculate cumulative distance within each year.
-- Show year, activity_date, distance_km, and cumulative_ytd_km. Order by activity_date.
-- TABLE: site_runs
-- HINT: SUM(distance_km) OVER (PARTITION BY EXTRACT(YEAR FROM activity_date) ORDER BY activity_date).

-- YOUR SOLUTION BELOW:
