# Agent Interface

Running Signals is designing a read-only Model Context Protocol (MCP) interface for domain-aware
questions about consistency, volume, routes, and fitness trends. The contract design is active, but
there is no deployed MCP server, production endpoint, agent runtime, or multi-user application in
this repository.

The purpose of the interface is to show how governed analytics can support an agent without giving
it unrestricted access to the warehouse. It extends the analytics engineering system; it does not
turn Running Signals into a coaching or health product.

## Why Gold Models Are The Foundation

Useful running answers depend on more than retrieving rows. Terms such as an active week, long-run
contribution, route identity, or pace and heart-rate efficiency need stable definitions, known
grains, consistent units, freshness context, and documented missing-data behavior.

The dbt gold models provide that governed surface. They centralize analytical definitions and
quality checks before any tool or agent can use them. An MCP tool can therefore expose a small,
typed operation such as `get_volume_trend` instead of allowing arbitrary SQL. This keeps the answer
traceable to reviewed models and prevents business logic from being recreated in prompts or client
code.

The intended request flow is:

```text
user question
    -> application agent and MCP client
    -> bounded read-only MCP tool
    -> approved Databricks gold models
    -> typed evidence, provenance, freshness, and caveats
    -> application-rendered chart, map, table, and analysis
```

## Example Questions And Presentation

The contract is designed around running-specific questions with predictable evidence and visual
forms:

| Question | Governed context | Expected presentation |
| --- | --- | --- |
| How has weekly distance changed over the last 12 weeks? | Weekly distance, units, completed-week rules, and rolling context | Line chart with a concise trend summary |
| Compare recent runs on this route with earlier attempts. | Stable route identity, route history, pace, heart rate, and sample count | Route map, comparison table, and descriptive differences |
| Where have breaks appeared in training this year? | Active-week definition, missed weeks, and streak logic | Calendar or weekly bars with break evidence |
| Is pace at a similar heart rate changing over time? | Pace, heart rate, efficiency definition, dates, and missingness | Trend chart with sample context and caveats |

Planned read-only tools include:

- `get_training_summary`
- `get_volume_trend`
- `compare_route_runs`
- `get_fitness_trend`

Planned MCP resources provide signal definitions, the approved gold model catalog, data freshness,
and quality context. Tools return typed data and visualization intent, not rendered UI. A consuming
mobile or web application decides how to render accessible charts, maps, tables, and narrative
analysis for its platform.

## Responsibility Boundaries

### Databricks And dbt

- Ingest and model source data through bronze, silver, and gold layers.
- Own metric definitions, route identity, analytical grains, tests, lineage, and freshness metadata.
- Promote only reviewed, stable analytical outputs into the approved gold surface.

### MCP Interface

- Expose a small set of parameterized, read-only tools over approved gold models.
- Validate inputs and enforce bounded query paths rather than accepting arbitrary SQL.
- Return structured evidence, visualization intent, provenance, freshness, and caveats.
- Publish resources that describe definitions, model contracts, and quality context.

### Agent

- Map a user question to the appropriate tool and parameters.
- Summarize only what the returned evidence supports.
- Preserve qualifications, units, time windows, provenance, and safety boundaries.
- Avoid inventing coaching, medical conclusions, or unavailable context.

### Mobile Or Web Application

- Own authentication, authorization, user scoping, and secure MCP client configuration.
- Render platform-appropriate charts, route maps, tables, and written analysis.
- Preserve keyboard, screen-reader, loading, empty, and error behavior.
- Keep data from different users isolated in every request and cache boundary.

Running Signals remains a single-athlete analytical reference implementation. A future consuming
application must establish user identity and scope before the contract can serve multiple users.

## Offline ML Findings

Offline baseline comparisons and validation experiments use the versioned feature and label marts.
Their outputs do not flow directly to the MCP interface. Error and feature analysis can instead
identify missing context, data-quality gaps, or a useful analytical relationship.

Only findings that are stable, explainable, and deliberately reviewed should be promoted into a
documented and tested gold metric or feature. Once promoted, that governed output may improve the
context available to MCP tools and the charts or analysis a consuming application can present.
This creates a controlled path from experimentation to analytical value without serving
experimental predictions.

## Privacy And Safety

The proposed contract keeps the following boundaries explicit:

- GPS data: tools may return approved route geometry or summaries needed for a map, but do not expose
  raw FIT payloads or unrestricted GPS records. A production application would also need controls
  for sensitive start, end, and home locations.
- Health context: resting heart rate, HRV, and sleep fields remain descriptive analytical context.
  They are not diagnoses, medical advice, or readiness scores.
- User isolation: every production request must be authenticated and scoped to one user. The MCP
  layer must not rely on the agent prompt to enforce isolation.
- Mutations: the interface is read-only. It cannot write warehouse data, change pipelines, or alter
  source records.
- Interpretation: responses may describe observed patterns and evidence, but do not provide
  unqualified coaching or medical interpretation.

## Current Status

Contract and resource design is in progress. The reviewer-facing site documents the intended tool
surface, response shape, rendering boundary, and safety constraints. No deployed server or live MCP
endpoint is claimed.
