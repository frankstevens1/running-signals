-- TASK: Find the longest streak of consecutive days with at least one run.
-- Show the streak length as the single output row.
-- TABLE: site_days
-- HINT: This is a gaps-and-islands problem. Use ROW_NUMBER() and date subtraction.
-- With consecutive_dates AS (SELECT calendar_date, calendar_date - (ROW_NUMBER() OVER (ORDER BY calendar_date))::int AS grp FROM site_days WHERE active_day_flag)
-- Then COUNT(*) per grp, ORDER BY count DESC, LIMIT 1.

-- YOUR SOLUTION BELOW:
