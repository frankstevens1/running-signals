---
id: 10-advanced-analytics
order: 10
title: "Advanced Analytics Patterns"
description: "Period-over-period growth, year-over-year comparisons, streak detection, personal records, training load, and cohort-style analysis."
---

## Core Concepts

**Period-over-period growth** compares a metric to the previous period. Use LAG with appropriate offsets: `(current - previous) * 100.0 / NULLIF(previous, 0)` for percentage change. Week-over-week (WoW), month-over-month (MoM), and year-over-year (YoY) are the most common.

**Year-over-year (YoY)** comparisons require aligning the same period across years. Use EXTRACT for the period component and join or use LAG with offset equal to the number of periods per year (e.g., 12 for monthly YoY).

**Streak detection** uses the gaps-and-islands pattern. The key insight: subtract ROW_NUMBER() from the date to create a group identifier — consecutive dates share the same group. Then count rows per group.

**Personal records** use window functions for ranking and filtering. `ROW_NUMBER() OVER (PARTITION BY year ORDER BY metric)` with `WHERE rank = 1` gives the best per year.

**Cumulative percentages**: running total divided by overall total. `SUM(metric) OVER (ORDER BY ...) / SUM(metric) OVER ()` gives the running percentage.

**Training load** is a derived metric combining volume and intensity. Common formula: distance × heart rate proxy. Track its trend over time with moving averages.

**Cohort-style analysis** groups entities by a shared characteristic (e.g., week of first run) and tracks their behavior over time.

**Correlation proxies**: while SQL doesn't have CORR() in all databases, you can compute covariance-like metrics: how does one variable trend relative to another?

## Syntax Reference

```sql
-- Week-over-week growth
SELECT week_start_date, weekly_distance_km,
  LAG(weekly_distance_km) OVER (ORDER BY week_start_date) AS prev_week_km,
  ROUND((weekly_distance_km - LAG(weekly_distance_km) OVER (ORDER BY week_start_date))
    * 100.0 / NULLIF(LAG(weekly_distance_km) OVER (ORDER BY week_start_date), 0), 1) AS wow_growth_pct
FROM site_weeks
ORDER BY week_start_date;

-- Year-over-year monthly comparison
WITH monthly AS (
  SELECT EXTRACT(YEAR FROM activity_date) AS year,
         EXTRACT(MONTH FROM activity_date) AS month,
         SUM(distance_km) AS total_km
  FROM site_runs
  GROUP BY EXTRACT(YEAR FROM activity_date), EXTRACT(MONTH FROM activity_date)
)
SELECT year, month, total_km,
  LAG(total_km, 12) OVER (ORDER BY year, month) AS prev_year_same_month
FROM monthly
ORDER BY year, month;

-- Running percentage
SELECT activity_date, distance_km,
  SUM(distance_km) OVER (ORDER BY activity_date) AS cumulative_km,
  ROUND(SUM(distance_km) OVER (ORDER BY activity_date) * 100.0
    / SUM(distance_km) OVER (), 1) AS cumulative_pct
FROM site_runs
ORDER BY activity_date;
```

## Examples on Your Running Data

```sql
-- Personal records by year
WITH ranked AS (
  SELECT activity_date, distance_km, avg_pace_min_per_km,
    EXTRACT(YEAR FROM activity_date) AS year,
    ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM activity_date) ORDER BY distance_km DESC) AS longest_rank,
    ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM activity_date) ORDER BY avg_pace_min_per_km ASC) AS fastest_rank
  FROM site_runs
)
SELECT year, activity_date, distance_km, avg_pace_min_per_km,
  CASE WHEN longest_rank = 1 THEN 'Longest' END AS longest_record,
  CASE WHEN fastest_rank = 1 THEN 'Fastest' END AS fastest_record
FROM ranked
WHERE longest_rank = 1 OR fastest_rank = 1
ORDER BY year;
```

```sql
-- Training load proxy (distance × average heart rate as intensity proxy)
SELECT activity_date, distance_km, avg_heart_rate,
  ROUND(distance_km * COALESCE(avg_heart_rate, 150) / 100.0, 1) AS training_load,
  ROUND(AVG(distance_km * COALESCE(avg_heart_rate, 150) / 100.0)
    OVER (ORDER BY activity_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 1) AS load_7day_avg
FROM site_runs
ORDER BY activity_date DESC
LIMIT 50;
```

## Key Takeaways

- Period-over-period comparisons use LAG with the appropriate offset
- YoY requires aligning the same month/day across years — EXTRACT helps
- Streak detection uses the ROW_NUMBER subtraction trick to group consecutive dates
- Personal records use ROW_NUMBER + filter = 1
- Derived metrics (like training load) are computed in SELECT and can be fed into window functions
- Always handle division by zero with NULLIF when computing percentages
- For large datasets, compute aggregates in CTEs before applying window functions
