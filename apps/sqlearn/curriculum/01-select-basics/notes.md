---
id: 01-select-basics
order: 1
title: "SELECT & Filtering Basics"
description: "Retrieving columns, filtering rows with WHERE, sorting with ORDER BY, limiting results, and using DISTINCT."
---

## Core Concepts

**SELECT** specifies which columns to return. Always prefer explicit column names over `*` in real queries — it's self-documenting and avoids unnecessary data transfer.

**FROM** tells the database which table (or view) to read from. Every SELECT needs a FROM clause (in PostgreSQL, you can omit it for constant expressions, but in practice you always have one).

**WHERE** filters rows BEFORE any grouping or aggregation. Only rows that satisfy the condition are included. Filter early to reduce the amount of data processed downstream.

**Comparison operators**: `=` (equal), `<>` or `!=` (not equal), `>` (greater), `<` (less), `>=`, `<=`.

**Logical operators**: `AND` (both true), `OR` (either true), `NOT` (negate). Use parentheses to control evaluation order — `AND` binds tighter than `OR`, so `a OR b AND c` means `a OR (b AND c)`.

**BETWEEN** is inclusive on both ends in PostgreSQL. `x BETWEEN 5 AND 10` equals `x >= 5 AND x <= 10`.

**IN (value1, value2, ...)** checks if a value matches any in a list. Cleaner than chaining multiple ORs. Can also use a subquery: `IN (SELECT ...)`.

**LIKE** does pattern matching. `%` matches any sequence of characters, `_` matches exactly one character. `ILIKE` is case-insensitive (PostgreSQL). Avoid LIKE with leading `%` on large tables — it can't use indexes.

**ORDER BY** sorts results. Default is ASC (ascending). Use DESC for descending. Can sort by multiple columns: `ORDER BY year DESC, distance_km ASC`. In PostgreSQL, NULLs sort last by default; use `NULLS FIRST` to change.

**LIMIT** restricts rows returned. Always use it during exploration. Combine with OFFSET for pagination — but OFFSET on large datasets is slow; cursor-based pagination is better.

**DISTINCT** removes duplicate rows. If applied to multiple columns, the combination must be unique. DISTINCT can be expensive — it requires sorting or hashing all rows.

## Syntax Reference

```sql
SELECT column1, column2, column3
FROM table_name
WHERE condition1 AND (condition2 OR condition3)
ORDER BY column1 DESC, column2 ASC
LIMIT 20;
```

```sql
SELECT DISTINCT column1
FROM table_name
WHERE column2 IN ('A', 'B', 'C')
ORDER BY column1;
```

## Examples on Your Running Data

```sql
-- All columns for the 10 most recent runs
SELECT *
FROM site_runs
ORDER BY activity_date DESC
LIMIT 10;
```

```sql
-- Specific columns with filtering
SELECT activity_date, distance_km, avg_pace_min_per_km, avg_heart_rate
FROM site_runs
WHERE distance_km > 10
  AND activity_date >= '2025-01-01'
ORDER BY activity_date DESC
LIMIT 20;
```

```sql
-- All distinct route distance buckets
SELECT DISTINCT route_distance_bucket_km
FROM site_runs
ORDER BY route_distance_bucket_km;
```

```sql
-- Days with at least one run
SELECT calendar_date, distance_km, run_count
FROM site_days
WHERE active_day_flag = true
ORDER BY calendar_date DESC
LIMIT 30;
```

## Key Takeaways

- SELECT determines what columns appear; FROM determines what table
- WHERE runs before SELECT aliases — you cannot reference column aliases in WHERE
- Always use ORDER BY if order matters — SQL makes no ordering guarantees without it
- LIMIT is your friend during exploration; without it you might fetch millions of rows
- DISTINCT deduplicates but can be expensive on large datasets
- Use IN instead of chaining many ORs
- BETWEEN is inclusive on both ends in PostgreSQL
