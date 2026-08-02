---
id: 06-date-time
order: 6
title: "Date & Time Functions"
description: "EXTRACT, DATE_TRUNC, date arithmetic, interval calculations, weekday analysis, and temporal patterns."
---

## Core Concepts

**Date handling** is fundamental in BI. Your running data has dates like `activity_date` (date type) and `start_time` (timestamp). Knowing when things happened enables trend analysis, period-over-period comparisons, and temporal segmentation.

**EXTRACT(field FROM date)** pulls out components: YEAR, MONTH, DAY, DOW (day of week, 0=Sunday), DOY (day of year), WEEK, QUARTER, HOUR, MINUTE.

**DATE_TRUNC('unit', date)** truncates to the specified precision. `DATE_TRUNC('week', '2025-06-15')` returns the Monday of that week. `DATE_TRUNC('month', ...)` returns the first day of the month. Essential for grouping by time periods.

**Date arithmetic** uses integers (days) or intervals. `date + 7` adds 7 days. `date + INTERVAL '1 month'` adds one month. Subtracting two dates gives the number of days between them.

**CURRENT_DATE** returns today's date. Use `CURRENT_DATE - INTERVAL '30 days'` for relative date filtering.

**TO_CHAR(date, format)** formats dates as strings. `TO_CHAR(date, 'Day')` returns the weekday name. `TO_CHAR(date, 'Month YYYY')` returns "June    2025".

**AGE(timestamp1, timestamp2)** returns the interval between two timestamps.

## Syntax Reference

```sql
-- Extract components
SELECT EXTRACT(YEAR FROM activity_date) AS year,
       EXTRACT(MONTH FROM activity_date) AS month,
       EXTRACT(DOW FROM activity_date) AS day_of_week
FROM site_runs;

-- Truncate to period boundaries
SELECT DATE_TRUNC('week', activity_date) AS week_start,
       DATE_TRUNC('month', activity_date) AS month_start,
       SUM(distance_km) AS total_km
FROM site_runs
GROUP BY DATE_TRUNC('month', activity_date);

-- Date arithmetic
SELECT activity_date, activity_date + 7 AS next_week,
       activity_date - INTERVAL '30 days' AS thirty_days_ago
FROM site_runs;
```

## Examples on Your Running Data

```sql
-- Runs per month
SELECT DATE_TRUNC('month', activity_date) AS month,
       COUNT(*) AS run_count,
       ROUND(SUM(distance_km), 1) AS total_km
FROM site_runs
GROUP BY DATE_TRUNC('month', activity_date)
ORDER BY month;
```

```sql
-- Day of week analysis (0=Sunday, 6=Saturday)
SELECT EXTRACT(DOW FROM activity_date) AS dow,
       COUNT(*) AS run_count,
       ROUND(AVG(distance_km), 2) AS avg_distance
FROM site_runs
GROUP BY EXTRACT(DOW FROM activity_date)
ORDER BY dow;
```

```sql
-- Days between consecutive runs
SELECT activity_date,
  activity_date - LAG(activity_date) OVER (ORDER BY activity_date) AS days_since_last
FROM site_runs
ORDER BY activity_date DESC
LIMIT 30;
```

```sql
-- Last 90 days of runs
SELECT activity_date, distance_km, avg_pace_min_per_km
FROM site_runs
WHERE activity_date >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY activity_date DESC;
```

## Key Takeaways

- `EXTRACT(YEAR FROM date)` returns a numeric value, not a date
- `DATE_TRUNC` always returns the start of the period (Monday for week, 1st for month)
- PostgreSQL's `INTERVAL` supports `'1 day'`, `'2 weeks'`, `'3 months'`, `'1 year'`
- DOW in PostgreSQL: 0=Sunday, 1=Monday, ..., 6=Saturday (differs from ISO)
- Use `ISODOW` for ISO-standard day of week (1=Monday, 7=Sunday)
- Date subtraction (`date1 - date2`) returns an integer (number of days)
- Timestamp subtraction returns an interval
