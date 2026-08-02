-- TASK: Join site_runs with site_route_segments to show per-segment data.
-- Filter to metric 1km segments. Show activity_date, segment_index, segment_pace_min_per_km, and avg_heart_rate.
-- Order by activity_date descending, segment_index ascending. Limit to 50 rows.
-- TABLE: site_runs JOIN site_route_segments
-- HINT: INNER JOIN ON run_id. Filter where unit_system='metric' AND segment_length_value=1.

-- YOUR SOLUTION BELOW:
