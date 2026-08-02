---
id: 08-set-operations
order: 8
title: "Set Operations"
description: "UNION, UNION ALL, INTERSECT, and EXCEPT for combining result sets from multiple queries."
---

## Core Concepts

**Set operations** combine rows from two or more queries into a single result. All queries in a set operation must have the same number of columns, and corresponding columns must have compatible data types.

**UNION** combines results from two queries and removes duplicate rows. It's essentially DISTINCT applied to the combined set. Use it to merge similar data from different sources.

**UNION ALL** combines results without removing duplicates. Faster than UNION because no deduplication step is needed. Use when you know there are no duplicates or when you want to preserve them.

**INTERSECT** returns rows that appear in BOTH result sets. Think of it as finding common elements across two datasets.

**EXCEPT** returns rows from the first query that do NOT appear in the second. Think of it as subtraction — what's in A but not in B.

**Order of operations**: Set operations are evaluated left-to-right unless parentheses override. You can combine multiple set operations in one query.

**ORDER BY** in set operations applies to the final combined result and can only appear at the end of the last query. Column references use the first query's column names.

## Syntax Reference

```sql
-- UNION: unique rows from both
SELECT column1, column2 FROM table_a
UNION
SELECT column1, column2 FROM table_b;

-- UNION ALL: all rows (with duplicates)
SELECT column1, column2 FROM table_a
UNION ALL
SELECT column1, column2 FROM table_b;

-- INTERSECT: common rows
SELECT column1, column2 FROM table_a
INTERSECT
SELECT column1, column2 FROM table_b;

-- EXCEPT: in A but not in B
SELECT column1, column2 FROM table_a
EXCEPT
SELECT column1, column2 FROM table_b;

-- Combined with aggregation
SELECT category, COUNT(*) FROM (
  SELECT column1 AS category FROM table_a
  UNION ALL
  SELECT column1 FROM table_b
) combined
GROUP BY category;
```

## Examples on Your Running Data

```sql
-- All runs from 2024 and 2025 (deduplicated)
SELECT activity_date, distance_km, avg_pace_min_per_km
FROM site_runs WHERE EXTRACT(YEAR FROM activity_date) = 2024
UNION
SELECT activity_date, distance_km, avg_pace_min_per_km
FROM site_runs WHERE EXTRACT(YEAR FROM activity_date) = 2025
ORDER BY activity_date;
```

```sql
-- Distance buckets that appear in both 2024 and 2025
SELECT DISTINCT route_distance_bucket_km
FROM site_runs WHERE EXTRACT(YEAR FROM activity_date) = 2024
INTERSECT
SELECT DISTINCT route_distance_bucket_km
FROM site_runs WHERE EXTRACT(YEAR FROM activity_date) = 2025
ORDER BY route_distance_bucket_km;
```

```sql
-- Routes run in 2024 but not yet in 2025
SELECT DISTINCT route_id
FROM site_runs WHERE EXTRACT(YEAR FROM activity_date) = 2024
EXCEPT
SELECT DISTINCT route_id
FROM site_runs WHERE EXTRACT(YEAR FROM activity_date) = 2025;
```

## Key Takeaways

- All queries in a set operation must have the same number and type of columns
- Column names come from the first query — aliases in subsequent queries are ignored
- UNION removes duplicates (slower); UNION ALL preserves them (faster)
- INTERSECT and EXCEPT are less commonly used but very expressive
- Set operations work on complete rows, not individual columns
- For performance, prefer JOIN with DISTINCT over INTERSECT when possible
- NULL values are treated as equal in set operations (unlike in regular comparisons)
