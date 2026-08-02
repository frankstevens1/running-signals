---
id: 09-null-data-quality
order: 9
title: "NULL Handling & Data Quality"
description: "Working with missing data, COALESCE, NULLIF, data completeness checks, outlier detection, and quality reporting."
---

## Core Concepts

**NULL** in SQL means "unknown" or "missing" — not zero, not empty string, not false. NULL propagates through expressions: anything compared to NULL yields NULL (not true, not false). Use `IS NULL` or `IS NOT NULL` to check for NULL values.

**Three-valued logic**: Comparisons with NULL return NULL (neither TRUE nor FALSE). In WHERE clauses, rows where the condition evaluates to NULL are excluded. This is why `WHERE column = NULL` never matches — it's NULL, which is not TRUE.

**COUNT(*) vs COUNT(column)**: `COUNT(*)` counts all rows. `COUNT(column)` counts only rows where column is NOT NULL. The difference tells you how many rows have missing values.

**COALESCE** returns the first non-null argument. Essential for:
- Providing defaults: `COALESCE(heart_rate, 0)`
- Fallback chains: `COALESCE(preferred_column, backup_column, 0)`
- Converting NULL to meaningful values in reports

**NULLIF** returns NULL if two values are equal. Most commonly used to avoid division by zero: `value / NULLIF(divisor, 0)`. Also useful for converting sentinel values (like -1 or 0) to NULL.

**Data quality checks** use SQL to validate data:
- Completeness: what percentage of values are non-null?
- Consistency: do related columns agree? (avg_hr present but max_hr null)
- Validity: are values within expected ranges?
- Uniqueness: are primary key values unique?

**Outlier detection**: Values more than N standard deviations from the mean. `ABS(value - AVG) / STDDEV > 3` identifies extreme outliers.

## Syntax Reference

```sql
-- Count NULLs vs non-NULLs
SELECT
  COUNT(*) AS total_rows,
  COUNT(column) AS non_null_values,
  COUNT(*) - COUNT(column) AS null_values,
  ROUND(COUNT(column) * 100.0 / COUNT(*), 1) AS completeness_pct
FROM table;

-- COALESCE for defaults
SELECT column1, COALESCE(nullable_column, 'N/A') AS display_value
FROM table;

-- NULLIF to avoid division by zero
SELECT distance_km / NULLIF(duration_hours, 0) AS speed
FROM table;

-- Outlier detection
SELECT *
FROM table
WHERE ABS(value - (SELECT AVG(value) FROM table)) > 3 * (SELECT STDDEV(value) FROM table);
```

## Examples on Your Running Data

```sql
-- Heart rate data completeness
SELECT
  COUNT(*) AS total_runs,
  COUNT(avg_heart_rate) AS runs_with_hr,
  COUNT(*) - COUNT(avg_heart_rate) AS runs_without_hr,
  ROUND(COUNT(avg_heart_rate) * 100.0 / COUNT(*), 1) AS hr_completeness_pct
FROM site_runs;
```

```sql
-- Data quality: find inconsistent records
SELECT activity_date, avg_heart_rate, max_heart_rate
FROM site_runs
WHERE avg_heart_rate IS NULL AND max_heart_rate IS NOT NULL;
```

```sql
-- Distance outlier detection
WITH stats AS (
  SELECT AVG(distance_km) AS mean, STDDEV(distance_km) AS stddev
  FROM site_runs
)
SELECT activity_date, distance_km,
  ROUND((distance_km - stats.mean) / stats.stddev, 2) AS z_score
FROM site_runs, stats
WHERE ABS(distance_km - stats.mean) > 3 * stats.stddev
ORDER BY activity_date DESC;
```

## Key Takeaways

- NULL is not a value — it's the absence of a value. `column = NULL` is always false
- Use `IS NULL` / `IS NOT NULL` — never `= NULL` or `!= NULL`
- COUNT includes NULLs in `COUNT(*)` but excludes them in `COUNT(column)`
- `AVG` and `SUM` ignore NULLs — they compute over non-null values only
- In set operations (UNION, INTERSECT, EXCEPT), NULLs are treated as equal
- ORDER BY puts NULLs last by default in PostgreSQL; use `NULLS FIRST` to change
- Always validate your assumptions about data quality before building reports
