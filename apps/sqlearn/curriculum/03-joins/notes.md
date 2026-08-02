---
id: 03-joins
order: 3
title: "JOINs"
description: "COUNT, SUM, AVG, MIN, MAX with GROUP BY, and HAVING for post-aggregation filters."
---

## Core Concepts

**Aggregate functions** collapse multiple rows into a single value:
- `COUNT(*)` — number of rows
- `COUNT(column)` — number of non-null values in a column
- `COUNT(DISTINCT column)` — number of unique non-null values
- `SUM(column)` — total sum
- `AVG(column)` — average value
- `MIN(column)` / `MAX(column)` — minimum / maximum
- `STDDEV(column)` — standard deviation (PostgreSQL)

**GROUP BY** splits the data into groups, then applies aggregate functions to each group. Every column in SELECT that is NOT an aggregate must appear in GROUP BY.

**HAVING** filters groups after aggregation. Think of it as WHERE for grouped results. WHERE filters rows before grouping; HAVING filters groups after.

**Execution order**: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT

## Syntax Reference

```sql
SELECT column1, AGG_FUNC(column2), AGG_FUNC(column3)
FROM table
WHERE condition   -- filters rows before grouping
GROUP BY column1
HAVING AGG_FUNC(column2) > threshold   -- filters groups after aggregation
ORDER BY AGG_FUNC(column2) DESC
LIMIT 20;
```

## Examples on Your Running Data

```sql
-- Total runs and distance per calendar year
SELECT
  EXTRACT(YEAR FROM activity_date) AS year,
  COUNT(*) AS run_count,
  ROUND(SUM(distance_km), 1) AS total_distance_km,
  ROUND(AVG(distance_km), 2) AS avg_run_distance_km
FROM site_runs
GROUP BY EXTRACT(YEAR FROM activity_date)
ORDER BY year;
```

```sql
-- Weekly rollup: find weeks where you ran 4+ times and covered 30+ km
SELECT
  week_start_date,
  runs_per_week,
  weekly_distance_km,
  avg_pace_min_per_km
FROM site_weeks
WHERE weekly_distance_km >= 30
  AND runs_per_week >= 4
ORDER BY week_start_date DESC
LIMIT 20;
```

```sql
-- Route stats: average pace and heart rate per route distance bucket
-- Only include buckets with 3+ runs
SELECT
  route_distance_bucket_km,
  COUNT(*) AS run_count,
  ROUND(AVG(avg_pace_min_per_km), 2) AS avg_pace,
  ROUND(AVG(avg_heart_rate), 1) AS avg_hr
FROM site_runs
GROUP BY route_distance_bucket_km
HAVING COUNT(*) >= 3
ORDER BY run_count DESC;
```

## Key Takeaways

- Every non-aggregated column in SELECT must be in GROUP BY
- WHERE filters rows before aggregation; HAVING filters after
- `COUNT(*)` counts rows; `COUNT(column)` counts non-null values
- Aggregation discards detail — you can't see individual rows in a grouped result
