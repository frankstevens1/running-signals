# Technical Decisions

## Why Recovery HR belongs under Fitness

Garmin Recovery HR measures the heart-rate drop after stopping an activity, typically over a
two-minute window.

For this project, it belongs in the fitness signal group when it is available in the Garmin FIT event
payload. It helps describe cardiovascular adaptation alongside pace/heart-rate efficiency without
creating a broader recovery product surface.

It is not modeled as a standalone recovery pillar because that would imply a broader recovery model
involving sleep, HRV, fatigue, soreness, and training readiness. That is outside the intended scope.

## Why unattended Garmin downloads use Hetzner access keys instead of AWS IAM

The original design used AWS IAM with OIDC for unattended job credentials, but the project
migrated to Hetzner Object Storage (S3-compatible). Hetzner uses long-lived access key / secret key
pairs rather than short-lived IAM role credentials.

For unattended object storage downloads in automation (GitHub Actions, scheduled jobs), pass the
Hetzner access key and secret key as secrets to the job runtime. Hetzner credentials do not expire
unless you revoke them in the Console, so no OIDC or SSO token refresh is needed.

If the access key is exposed, revoke it in Hetzner Console and generate a replacement. Treat the
secret key with the same care as any long-lived credential: store it in a secret manager, never
commit it to Git, and rotate it periodically.

This only covers object storage access. Garmin Connect authentication still needs a separate
non-interactive strategy using a writable external token store or explicitly provided credentials.

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
