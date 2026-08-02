-- TASK: Use a CTE to calculate per-route stats (run count, avg pace), then rank routes
-- by total runs using ROW_NUMBER(). Show rank, route_id, run_count, and avg_pace.
-- TABLE: site_runs JOIN site_routes
-- HINT: CTE computes the join, then SELECT with ROW_NUMBER() OVER (ORDER BY run_count DESC).

-- YOUR SOLUTION BELOW:
