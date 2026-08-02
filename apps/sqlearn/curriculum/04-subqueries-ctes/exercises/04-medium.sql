-- TASK: For each run, show its distance and the average distance of all runs in the same
-- route_distance_bucket_km. Show activity_date, distance_km, bucket, and bucket_avg.
-- TABLE: site_runs
-- HINT: Use a correlated subquery in SELECT: (SELECT AVG(r2.distance_km) FROM site_runs r2 WHERE r2.route_distance_bucket_km = r.route_distance_bucket_km).

-- YOUR SOLUTION BELOW:
