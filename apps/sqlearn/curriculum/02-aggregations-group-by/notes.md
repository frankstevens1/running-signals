---
id: 02-aggregations-group-by
order: 2
title: "Aggregations & GROUP BY"
description: "Row-level filters, comparison operators, AND/OR logic, IN, BETWEEN, and pattern matching."
---

## Core Concepts

**WHERE** filters rows before any grouping or aggregation happens. Only rows that satisfy the condition are included.

**Comparison operators**: `=` (equal), `<>` or `!=` (not equal), `>` (greater than), `<` (less than), `>=` (greater or equal), `<=` (less or equal).

**Logical operators**: `AND` (both conditions true), `OR` (either condition true), `NOT` (negates a condition). Use parentheses `()` to control evaluation order — `AND` binds tighter than `OR`.

**BETWEEN** checks if a value falls in a range. `x BETWEEN a AND b` is equivalent to `x >= a AND x <= b`. In PostgreSQL (and most SQL dialects), BETWEEN is inclusive of both endpoints.

**IN** checks if a value matches any value in a list. Cleaner than chaining multiple ORs.

**LIKE** does pattern matching with `%` (any characters) and `_` (single character). Use `ILIKE` for case-insensitive matching (PostgreSQL). For performance-sensitive queries, prefer `=` over `LIKE` without wildcards.

## Syntax Reference

```sql
SELECT columns
FROM table
WHERE condition1 AND (condition2 OR condition3)
ORDER BY column
LIMIT 20;
```

```sql
-- Range filter
WHERE column BETWEEN 10 AND 100

-- List filter
WHERE column IN (1, 2, 3)

-- Pattern matching
WHERE column LIKE 'Prefix%'
```

## Examples on Your Running Data

```sql
-- Runs longer than 10km
SELECT activity_date, distance_km, avg_pace_min_per_km
FROM site_runs
WHERE distance_km > 10
ORDER BY activity_date DESC
LIMIT 20;
```

```sql
-- Runs from 2025 with a heart rate above 150
SELECT activity_date, distance_km, avg_heart_rate
FROM site_runs
WHERE activity_date >= '2025-01-01'
  AND avg_heart_rate > 150
ORDER BY activity_date;
```

```sql
-- Routes in specific distance buckets
SELECT route_id, route_distance_bucket_km, run_count, avg_pace_min_per_km
FROM site_routes
WHERE route_distance_bucket_km IN ('5-10', '10-15', '15-21.1')
ORDER BY run_count DESC;
```

## Key Takeaways

- WHERE runs before SELECT aliases — you cannot reference column aliases in WHERE
- Use IN instead of chaining many ORs
- BETWEEN is inclusive on both ends in PostgreSQL
- LIKE with leading `%` cannot use indexes efficiently
