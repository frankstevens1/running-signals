-- TASK: Compute a training load proxy for each run: distance_km × COALESCE(avg_heart_rate, 150) / 100.
-- Then calculate a 7-day moving average of the load. Show activity_date, distance_km, hr, load, and load_7d_avg.
-- TABLE: site_runs
-- HINT: Compute load in SELECT, then AVG(load) OVER (ORDER BY activity_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW).

-- YOUR SOLUTION BELOW:
