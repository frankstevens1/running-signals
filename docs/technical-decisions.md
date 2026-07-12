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
