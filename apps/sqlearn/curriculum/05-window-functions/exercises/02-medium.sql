-- TASK: Rank runs by distance within each year (ties get same rank, gaps in ranking).
-- Show year, activity_date, distance_km, and rank. Order by year, then rank.
-- TABLE: site_runs
-- HINT: Use RANK() OVER (PARTITION BY EXTRACT(YEAR FROM activity_date) ORDER BY distance_km DESC).

-- YOUR SOLUTION BELOW:
