-- Specific columns: date, distance, pace, heart rate
SELECT activity_date, distance_km
FROM site_runs
ORDER BY activity_date DESC
LIMIT 10;