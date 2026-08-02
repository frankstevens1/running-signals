-- TASK: Show the previous run's distance and pace alongside each run.
-- Include activity_date, distance_km, avg_pace_min_per_km, prev_distance, and prev_pace.
-- Order by activity_date descending, limit to 20.
-- TABLE: site_runs
-- HINT: Use LAG(distance_km) OVER (ORDER BY activity_date) and LAG(avg_pace_min_per_km) OVER (...).

-- YOUR SOLUTION BELOW:
