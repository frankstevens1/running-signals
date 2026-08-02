-- TASK: Use two CTEs in sequence: first calculate yearly totals, then pick the best year.
-- Show the year and total_km for the year with the most distance.
-- TABLE: site_runs
-- HINT: WITH yearly AS (...), best AS (SELECT * FROM yearly ORDER BY total_km DESC LIMIT 1) SELECT * FROM best.

-- YOUR SOLUTION BELOW:
