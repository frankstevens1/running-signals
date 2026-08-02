-- TASK: Calculate a 7-run moving average of pace.
-- Show activity_date, avg_pace_min_per_km, and the 7-run moving average pace.
-- Order by activity_date descending, limit 30.
-- TABLE: site_runs
-- HINT: AVG(avg_pace_min_per_km) OVER (ORDER BY activity_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW).

-- YOUR SOLUTION BELOW:
