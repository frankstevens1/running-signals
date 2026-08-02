-- TASK: Calculate avg pace safely — avoid division by zero if duration_seconds is 0.
-- Show activity_date, distance_km, duration_seconds, and the computed pace.
-- TABLE: site_runs
-- HINT: Use distance_km / NULLIF(duration_seconds, 0) * 1000 / 60 to compute km/min pace.
-- NULLIF ensures no division by zero.

-- YOUR SOLUTION BELOW:
