-- TASK: Find pairs of runs on the same route where one was at least 30 seconds/km faster than the other.
-- Show the route_id, the date and pace of both runs, and the pace difference.
-- TABLE: site_runs (self-join)
-- HINT: Self-join site_runs ON route_id. Filter WHERE r1.activity_date < r2.activity_date
-- AND r1.avg_pace_min_per_km + 0.5 < r2.avg_pace_min_per_km. Limit to 20.

-- YOUR SOLUTION BELOW:
