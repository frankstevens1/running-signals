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
strategy using an external token store or explicitly provided credentials.
