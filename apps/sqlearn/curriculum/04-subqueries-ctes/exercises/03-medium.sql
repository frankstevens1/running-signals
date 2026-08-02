-- TASK: Find days that had at least one run longer than 10km.
-- Show calendar_date and distance_km from site_days. Order by date descending, limit 20.
-- TABLE: site_days (with EXISTS referencing site_runs)
-- HINT: Use WHERE EXISTS (SELECT 1 FROM site_runs WHERE activity_date = d.calendar_date AND distance_km > 10).

-- YOUR SOLUTION BELOW:
