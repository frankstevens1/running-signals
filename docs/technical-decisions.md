# Technical Decisions

## Why Recovery HR belongs under Fitness

Garmin Recovery HR measures the heart-rate drop after stopping an activity, typically over a
two-minute window.

For this project, it belongs in the fitness signal group when it is available in the Garmin FIT event
payload. It helps describe cardiovascular adaptation alongside pace/heart-rate efficiency without
creating a broader recovery product surface.

It is not modeled as a standalone recovery pillar because that would imply a broader recovery model
involving sleep, HRV, fatigue, soreness, and training readiness. That is outside the intended scope.

## Why unattended Garmin downloads should not use AWS SSO

AWS IAM Identity Center profiles are appropriate for local smoke tests and manual backfills, but they
are not a durable automation primitive. The local SSO token can expire and fail refresh with
`botocore.exceptions.TokenRetrievalError`, which would interrupt scheduled FIT or health JSON
landing jobs.

For unattended S3 downloads, prefer GitHub Actions OIDC assuming a narrowly scoped AWS IAM role. The
role should allow only the raw Garmin landing prefixes needed by the downloader. Running the job
inside AWS with an instance, task, or Lambda role is also acceptable because boto3 can retrieve
short-lived role credentials non-interactively.

Long-lived IAM user access keys are a fallback, not the preferred design. If used, they should be
scoped to the raw Garmin prefixes and rotated.

This only covers AWS access. Garmin Connect authentication still needs a separate non-interactive
strategy using a writable external token store or explicitly provided credentials.

## Why route geometry and analytical segments are separate

Fixed-distance segments are useful for pace, heart-rate, cadence, and elevation comparisons, but
their endpoints cannot reproduce corners or other detail between split boundaries. Route maps
therefore use `mart_activity_records`, which preserves every ordered presentation-safe telemetry
record and its nullable coordinates.

`mart_run_segments` remains an analytical aggregate and derives metric and imperial splits from a
small resolution table. Record intervals crossing a boundary are split proportionally, producing
reconciling distance and duration rather than grouping sparse boundary observations.

Run-session summaries and fitness drift use the accurate canonical 250m analytical rows. Route
clustering intentionally does not: it rebuilds the original floor-bucketed 250m H3 path directly
from silver records. Isolating that compatibility logic preserves established route identifiers
without forcing the improved analytical segments to retain legacy boundary behavior.

Legacy buckets select the lowest-distance H3 record and break equal-distance ties with
`record_index`. Previous `min_by` ties were undefined, so this may resolve an ambiguous historical
bucket once; subsequent route signatures are deterministic.

## Why full telemetry stays in Databricks

`mart_activity_records` retains every ordered FIT record in Databricks for route analysis, feature
engineering, model development, and future questions that require the original analytical grain.
Supabase is a presentation serving layer rather than a second big-data store, so it receives only
`mart_map_profile_records`: the six fields used by the site and at most 500 deterministic points per
run.

This boundary preserves full-fidelity analytical data where distributed processing belongs while
keeping the downstream web payload, synchronization time, database size, and serving indexes
proportional to the presentation requirement. A new analytical use case should read the complete
Databricks mart; Supabase should expand only when a concrete site contract requires more data.

## Why route centroids use map profile records instead of full telemetry

`mart_routes` needs a representative GPS centroid for each detected route so the site can place a
route card on a map overview. The initial implementation computed that centroid from
`mart_activity_records`, which holds every ordered telemetry record for every run. As the dataset
grew, joining the full telemetry table for the representative run of every route became the
longest-running part of the route mart and contributed to the `fit_refresh` pipeline timing out.

`mart_map_profile_records` already exists as the deterministic, presentation-safe subset of each
run: at most 500 ordered points containing exactly the fields the site needs, including latitude
and longitude. Using it for the centroid computation reduces the scan from potentially millions of
records per representative run to a maximum of 500 points per run, without changing the public
publisher contract or the site payload.

The tradeoff is a small loss in centroid precision for routes whose representative run contains
many more than 500 records. For the purpose of grouping routes into city-grid buckets and placing
a map marker, the 500-point sample is sufficient and far cheaper. Full telemetry remains available
in `mart_activity_records` for any future analytical work that needs sub-meter accuracy.

## Why route similarity edges prune by H3 start, end, and distance bucket

Route clustering compares every pair of GPS-backed runs to find routes that are likely the same
physical loop. The original implementation applied only a 10% distance tolerance before computing
a Jaccard-like similarity over 250m H3 path cells. As run volume increased, the candidate-pair
explosion in `route_similarity_edges` became the dominant cost of the entire `fit_refresh` job.

Adding equality filters on `route_distance_bucket_km`, `start_h3_cell_resolution_9`, and
`end_h3_cell_resolution_9` before the distance and Jaccard checks eliminates the vast majority of
non-matching pairs early. Any two runs that are 90% path-similar almost certainly share the same
half-kilometer distance bucket and the same H3 start/end cells, so the pruning rarely excludes
true matches while dramatically reducing shuffle and computation.

The tradeoff is a small risk of splitting near-identical routes whose start or end points fall in
adjacent H3 cells due to GPS drift. If that becomes measurable, the filter can be relaxed to a
small set of neighboring cells. Until then, the H3-and-bucket guard keeps the clustering step
proportional to the number of distinct routes rather than the square of the number of runs.
