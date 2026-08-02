---
id: 04-subqueries-ctes
order: 4
title: "Subqueries & CTEs"
description: "Nested queries, correlated subqueries, EXISTS, and Common Table Expressions (WITH)."
---

## Core Concepts

**Subqueries** are queries nested inside another query. They can appear in SELECT, FROM, WHERE, or HAVING clauses. The inner query runs first, then the outer query uses its result.

**Scalar subqueries** return exactly one row and one column. Use them wherever a single value is expected — in SELECT, WHERE comparisons, or HAVING.

**Row subqueries** return one row with multiple columns. Use them with row constructors.

**Table subqueries** return multiple rows and columns. Use them in FROM (derived tables) or with IN / EXISTS.

**Correlated subqueries** reference columns from the outer query. The inner query is re-executed for each row of the outer query. Powerful but can be slow on large datasets.

**EXISTS** checks whether a subquery returns any rows. It stops scanning as soon as it finds a match. Often more efficient than IN for large datasets. `NOT EXISTS` is useful for finding rows without matches.

**CTEs (Common Table Expressions)** are named temporary result sets defined with `WITH`. They make complex queries readable by breaking them into logical steps. A CTE can be referenced multiple times in the same query. In PostgreSQL, you can chain multiple CTEs separated by commas.

**CTE vs Subquery**: CTEs are more readable and reusable within a query. Subqueries can be more concise for simple cases. Both produce the same results in PostgreSQL (CTEs are not optimization fences like in older versions).

## Syntax Reference

```sql
-- Scalar subquery in WHERE
SELECT *
FROM site_runs
WHERE distance_km > (SELECT AVG(distance_km) FROM site_runs);

-- Correlated subquery
SELECT r.activity_date, r.distance_km,
  (SELECT AVG(r2.avg_pace_min_per_km)
   FROM site_runs r2
   WHERE r2.route_distance_bucket_km = r.route_distance_bucket_km
  ) AS bucket_avg_pace
FROM site_runs r;

-- EXISTS
SELECT calendar_date
FROM site_days d
WHERE EXISTS (
  SELECT 1 FROM site_runs r
  WHERE r.activity_date = d.calendar_date
    AND r.distance_km > 10
);

-- Single CTE
WITH monthly AS (
  SELECT DATE_TRUNC('month', activity_date) AS month,
         SUM(distance_km) AS total_km
  FROM site_runs
  GROUP BY DATE_TRUNC('month', activity_date)
)
SELECT * FROM monthly WHERE total_km > 50;

-- Multi-CTE chain
WITH yearly AS (
  SELECT EXTRACT(YEAR FROM activity_date) AS year,
         SUM(distance_km) AS total_km
  FROM site_runs
  GROUP BY EXTRACT(YEAR FROM activity_date)
),
best AS (
  SELECT * FROM yearly ORDER BY total_km DESC LIMIT 1
)
SELECT * FROM best;
```

## Examples on Your Running Data

```sql
-- Runs longer than your average run
SELECT activity_date, distance_km, avg_pace_min_per_km
FROM site_runs
WHERE distance_km > (SELECT AVG(distance_km) FROM site_runs)
ORDER BY activity_date DESC
LIMIT 20;
```

```sql
-- Routes run more than the average route
SELECT route_id, run_count, avg_distance_km
FROM site_routes
WHERE run_count > (SELECT AVG(run_count) FROM site_routes)
ORDER BY run_count DESC;
```

```sql
-- Days where you ran at least 10km
SELECT calendar_date, distance_km
FROM site_days
WHERE EXISTS (
  SELECT 1 FROM site_runs
  WHERE activity_date = site_days.calendar_date
    AND distance_km >= 10
)
ORDER BY calendar_date DESC
LIMIT 20;
```

## Key Takeaways

- Scalar subqueries must return exactly one value — use aggregates or LIMIT 1
- Correlated subqueries re-execute per outer row — can be slow; use window functions or JOINs as alternatives
- `EXISTS` is often faster than `IN` for large result sets because it short-circuits
- CTEs improve readability but don't create temporary tables in modern PostgreSQL — they're just inlined
- Name your CTEs descriptively — they document the query logic
