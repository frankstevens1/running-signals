-- TASK: Find your top 10% fastest runs by pace using PERCENT_RANK.
-- Show activity_date, distance_km, avg_pace_min_per_km, and the percentile rank.
-- Only include runs in the top 10% (percent_rank <= 0.1). Order by percentile.
-- TABLE: site_runs
-- HINT: Use PERCENT_RANK() OVER (ORDER BY avg_pace_min_per_km ASC). Filter with a subquery/CTE.

-- YOUR SOLUTION BELOW:
