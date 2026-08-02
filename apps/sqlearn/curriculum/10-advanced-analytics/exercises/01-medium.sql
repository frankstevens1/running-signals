-- TASK: Calculate week-over-week growth in distance using site_weeks.
-- Show week_start_date, weekly_distance_km, and wow_growth_pct (1 decimal).
-- Order by week_start_date descending, limit 20.
-- TABLE: site_weeks
-- HINT: Use LAG(weekly_distance_km) OVER (ORDER BY week_start_date).
-- Growth = (current - previous) * 100.0 / NULLIF(previous, 0).

-- YOUR SOLUTION BELOW:
