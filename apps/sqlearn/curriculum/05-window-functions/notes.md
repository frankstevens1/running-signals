---
id: 05-window-functions
order: 5
title: "Window Functions"
description: "ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, running totals, moving averages, and partition-based calculations."
---

## Core Concepts

**Window functions** perform calculations across a set of rows related to the current row. Unlike aggregate functions with GROUP BY, window functions do NOT collapse rows — every input row gets an output.

**PARTITION BY** divides rows into groups (windows). The function resets for each partition. Think of it as a GROUP BY that doesn't collapse.

**ORDER BY** in the window defines the ordering within each partition. Required for ranking functions and meaningful for cumulative/rolling calculations.

**ROW_NUMBER()** assigns a unique, sequential integer to each row within its partition. No ties — even identical ORDER BY values get different numbers.

**RANK()** assigns a rank with gaps. If two rows tie for rank 3, the next row gets rank 5. `DENSE_RANK()` does the same but without gaps — the next row gets rank 4.

**LAG(column, n)** accesses a row `n` positions before the current row. `LEAD(column, n)` accesses a row `n` positions ahead. Use them for period-over-period comparisons.

**Window frames** define which rows to include relative to the current row:
- `ROWS BETWEEN 6 PRECEDING AND CURRENT ROW` — 7-row sliding window
- `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — running total from start
- `RANGE` uses value ranges instead of row counts

**NTILE(n)** divides rows into `n` approximately equal buckets. Useful for quartiles, deciles, percentiles.

**PERCENT_RANK()** returns the relative rank (0 to 1) of a row. Formula: `(rank - 1) / (total_rows - 1)`.

## Syntax Reference

```sql
SELECT column,
  ROW_NUMBER() OVER (PARTITION BY category ORDER BY value DESC) AS row_num,
  RANK() OVER (PARTITION BY category ORDER BY value DESC) AS rank,
  LAG(value) OVER (ORDER BY date) AS prev_value,
  SUM(value) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
FROM table;
```

## Examples on Your Running Data

```sql
-- Rank runs by distance within each year
SELECT activity_date, distance_km,
  RANK() OVER (PARTITION BY EXTRACT(YEAR FROM activity_date) ORDER BY distance_km DESC) AS distance_rank
FROM site_runs
ORDER BY activity_date DESC
LIMIT 30;
```

```sql
-- Previous run's pace and distance alongside current
SELECT activity_date, distance_km, avg_pace_min_per_km,
  LAG(distance_km) OVER (ORDER BY activity_date) AS prev_distance,
  LAG(avg_pace_min_per_km) OVER (ORDER BY activity_date) AS prev_pace
FROM site_runs
ORDER BY activity_date DESC
LIMIT 20;
```

```sql
-- 7-run moving average of pace
SELECT activity_date, avg_pace_min_per_km,
  AVG(avg_pace_min_per_km) OVER (ORDER BY activity_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS moving_avg_pace
FROM site_runs
ORDER BY activity_date DESC
LIMIT 30;
```

```sql
-- Cumulative distance within each year
SELECT activity_date, distance_km,
  SUM(distance_km) OVER (PARTITION BY EXTRACT(YEAR FROM activity_date) ORDER BY activity_date) AS ytd_distance
FROM site_runs
ORDER BY activity_date;
```

## Key Takeaways

- Window functions execute after WHERE but before ORDER BY and LIMIT
- You cannot use window functions in WHERE — use a subquery or CTE first
- `ROW_NUMBER()` is deterministic per partition ordering; `RANK()` handles ties
- `LAG` and `LEAD` with no default return NULL for rows at the boundary
- Window frames with `ROWS` are faster than `RANGE` because they count rows instead of comparing values
- Always specify ORDER BY in ranking and cumulative functions — without it, results are non-deterministic
