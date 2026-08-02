---
id: 07-strings-case
order: 7
title: "String Functions & CASE"
description: "Text manipulation, pattern extraction, conditional logic with CASE WHEN, COALESCE, NULLIF, and dynamic categorization."
---

## Core Concepts

**CASE expressions** add if/else logic to SQL. They return a value based on conditions, like a switch statement. Two forms exist:
- **Simple CASE**: `CASE column WHEN value1 THEN result1 WHEN value2 THEN result2 ELSE default END`
- **Searched CASE**: `CASE WHEN condition1 THEN result1 WHEN condition2 THEN result2 ELSE default END`

**COALESCE(value1, value2, ...)** returns the first non-null argument. Essential for providing defaults for nullable columns. `COALESCE(avg_heart_rate, 0)` replaces NULL heart rates with 0.

**NULLIF(value1, value2)** returns NULL if value1 equals value2, otherwise returns value1. Useful for avoiding division by zero: `distance_km / NULLIF(duration_hours, 0)`.

**String concatenation** in PostgreSQL uses `||`. `'Run: ' || distance_km || 'km'` produces "Run: 12.3km". The `CONCAT()` function handles NULLs gracefully (treats them as empty strings).

**SPLIT_PART(string, delimiter, field)** splits a string and returns the nth part. Useful for parsing structured strings like `route_distance_bucket_km` values.

**SUBSTRING(string FROM pattern)** extracts substrings. `SUBSTRING('10-15' FROM '^\d+')` extracts "10".

**UPPER() / LOWER()** convert case. `INITCAP()` capitalizes the first letter of each word.

**TRIM() / LTRIM() / RTRIM()** remove whitespace. `TRIM('  hello  ')` returns "hello".

**LENGTH()** returns string length. **REPLACE()** substitutes substrings.

**Type casting** with `::` suffix: `distance_km::text` converts a number to text for string operations.

## Syntax Reference

```sql
-- Searched CASE for categorization
SELECT activity_date, distance_km,
  CASE
    WHEN avg_pace_min_per_km < 4.5 THEN 'Fast'
    WHEN avg_pace_min_per_km < 5.5 THEN 'Moderate'
    ELSE 'Easy'
  END AS pace_category
FROM site_runs;

-- COALESCE for defaults
SELECT activity_date,
  COALESCE(avg_heart_rate, 0) AS heart_rate,
  COALESCE(garmin_recovery_hr, 0) AS recovery_hr
FROM site_runs;

-- String building
SELECT activity_date,
  'Run on ' || TO_CHAR(activity_date, 'YYYY-MM-DD') || ': ' || ROUND(distance_km, 1)::text || 'km at ' || ROUND(avg_pace_min_per_km, 2)::text || '/km' AS run_label
FROM site_runs;
```

## Examples on Your Running Data

```sql
-- Pace categories for recent runs
SELECT activity_date, distance_km, ROUND(avg_pace_min_per_km, 2) AS pace,
  CASE
    WHEN avg_pace_min_per_km < 4.5 THEN 'Speed'
    WHEN avg_pace_min_per_km < 5.25 THEN 'Tempo'
    WHEN avg_pace_min_per_km < 6.0 THEN 'Easy'
    ELSE 'Recovery'
  END AS pace_type
FROM site_runs
ORDER BY activity_date DESC
LIMIT 30;
```

```sql
-- Combined classification: pace tier + HR zone
SELECT activity_date, distance_km,
  CASE
    WHEN avg_pace_min_per_km < 5.0 THEN 'Fast'
    WHEN avg_pace_min_per_km < 5.75 THEN 'Moderate'
    ELSE 'Slow'
  END AS pace_tier,
  CASE
    WHEN avg_heart_rate >= 160 THEN 'High'
    WHEN avg_heart_rate >= 140 THEN 'Medium'
    WHEN avg_heart_rate IS NOT NULL THEN 'Low'
    ELSE 'Unknown'
  END AS hr_zone
FROM site_runs
ORDER BY activity_date DESC
LIMIT 30;
```

```sql
-- Extract lower bound from distance bucket string
SELECT DISTINCT route_distance_bucket_km,
  SPLIT_PART(route_distance_bucket_km, '-', 1) AS lower_bound
FROM site_routes
ORDER BY route_distance_bucket_km;
```

## Key Takeaways

- `CASE` evaluates conditions in order and returns on the first match — order matters
- Every `CASE` should have an `ELSE` clause to handle unexpected values (otherwise returns NULL)
- `COALESCE` is syntactic sugar for `CASE WHEN col IS NOT NULL THEN col ELSE default END`
- `||` returns NULL if any operand is NULL; `CONCAT()` treats NULLs as empty strings
- Always cast numbers to text before concatenation with strings
- `SPLIT_PART` is zero-indexed for... no, it's 1-indexed (first field is 1)
