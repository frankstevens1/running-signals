# Terraform Infrastructure

Terraform manages the S3-backed raw Garmin landing zone and the Unity Catalog
objects that expose it to Databricks.

State is local for this portfolio phase and is ignored by Git.

The bucket has two separate prefixes:

- `garmin/`: raw Garmin files exposed through the external volume.
- `__databricks_managed/running_signals/`: Unity Catalog managed storage for
  the `running_signals` catalog.

These prefixes must not overlap. Raw landed files remain recoverable under
`garmin/fit`, while Databricks can still create managed objects in the catalog
when needed.

## Prerequisites

- AWS CLI v2.
- AWS IAM Identity Center configured for the AWS account.
- An IAM Identity Center user or group assigned to that AWS account with a
  permission set that can create S3 buckets, IAM roles, IAM policies, and trust
  relationships.
- Databricks workspace authentication through environment variables or a CLI
  profile with permission to create Unity Catalog storage credentials, external
  locations, catalogs, schemas, and volumes.

## AWS Credentials

Do not use AWS root user access keys. Root access keys are long-lived account
keys with unrestricted blast radius, and they are not appropriate for local
development.

Use AWS IAM Identity Center through AWS CLI v2 instead. This gives Terraform
short-lived credentials after a browser login.

There are two AWS regions involved:

- SSO region: where IAM Identity Center is configured, for example
  `eu-central-1`.
- Terraform AWS region: where this project creates AWS resources, set by
  `aws_region` in `terraform.tfvars`.

These may be the same, but they are separate settings.

### 1. Assign Account Access In IAM Identity Center

This is an AWS console admin step. Do it before configuring the CLI.

1. Sign in to the AWS console with an admin-capable user.
2. Open **IAM Identity Center**.
3. Confirm IAM Identity Center is enabled.
4. Open **Users** and confirm your user exists. Create it if needed.
5. Open **AWS accounts**.
6. Select the AWS account for this project.
7. Choose **Assign users or groups**.
8. Select your user or a group containing your user.
9. Assign a permission set.

For a personal development account, `AdministratorAccess` is the simplest way to
unblock this infrastructure work. For a stricter setup, the permission set must
cover at least:

- S3 bucket creation and bucket configuration
- IAM role creation
- IAM policy creation and attachment
- IAM trust policy management
- STS caller identity checks

If this assignment is missing, `aws configure sso` can authenticate you but will
fail with:

```text
No AWS accounts are available to you.
```

That error means the browser login worked, but IAM Identity Center has not
granted your user access to any AWS account.

### 2. Configure A Local AWS Profile

```bash
aws configure sso
```

Use the AWS access portal values from IAM Identity Center:

- SSO session name: `running-signals`
- SSO start URL: the AWS access portal URL, usually ending in `/start`
- SSO region: the IAM Identity Center region
- SSO registration scopes: press Enter to keep `sso:account:access`

Example:

```text
SSO session name (Recommended): running-signals
SSO start URL [None]: https://d-xxxxxxxxxx.awsapps.com/start
SSO region [None]: eu-central-1
SSO registration scopes [sso:account:access]:
```

After browser authorization, the CLI should list the AWS accounts and permission
sets assigned to you. Choose the account and permission set for this project.

Name the profile something explicit:

```text
running-signals-dev
```

### 3. Log In

```bash
aws sso login --profile running-signals-dev
```

### 4. Clear Stale Static Credentials

If old access keys are exported in the shell, they can override the profile and
produce `InvalidClientTokenId`. Clear them:

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
```

### 5. Verify The Identity

Do not run Terraform until this succeeds:

```bash
AWS_PROFILE=running-signals-dev aws sts get-caller-identity
```

Expected shape:

```json
{
  "UserId": "...",
  "Account": "123456789012",
  "Arn": "arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_..."
}
```

Confirm the `Account` is the account where the raw Garmin bucket should live.
If this fails, fix AWS login first; Terraform will fail the same way.

### 6. Pin Terraform To That Profile

Copy the sample variables file:

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
aws_region  = "eu-central-1"
aws_profile = "running-signals-dev"
```

Terraform passes that named profile directly to the AWS provider:

```hcl
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}
```

### AWS Troubleshooting

`No AWS accounts are available to you.`

Your IAM Identity Center login succeeded, but your user is not assigned to any
AWS account. Go back to **IAM Identity Center -> AWS accounts** and assign your
user or group to the target account with a permission set.

`InvalidClientTokenId`

Terraform or the AWS CLI is using stale static credentials. Clear exported
credentials and retry with the SSO profile:

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws sso login --profile running-signals-dev
AWS_PROFILE=running-signals-dev aws sts get-caller-identity
```

`The SSO session associated with this profile has expired or is otherwise invalid`

Log in again:

```bash
aws sso login --profile running-signals-dev
```

Wrong AWS account id in `get-caller-identity`

Re-run `aws configure sso`, choose the correct account and permission set, and
update `aws_profile` in `terraform.tfvars` if you create a new profile name.

## Terraform Variables

Copy the sample variables file:

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Set the local values:

```hcl
aws_region  = "eu-central-1"
aws_profile = "running-signals-dev"

raw_bucket_name = null
drop_default_schema = true

catalog_managed_storage_prefix = "__databricks_managed/running_signals"

databricks_profile = null
```

Leave the Databricks external ID values in bootstrap mode for a brand-new
workspace setup:

```hcl
databricks_storage_credential_external_id = "bootstrap"
skip_databricks_validation               = true
```

After the first apply creates the Databricks storage credential, you will replace
`bootstrap` with the real external ID and turn validation back on.

## Databricks External ID Bootstrap

Databricks storage credentials on AWS use an external ID in the IAM trust
policy.

If you already know the external ID, set it in `terraform.tfvars`:

```hcl
databricks_storage_credential_external_id = "<external-id>"
skip_databricks_validation               = false
```

For a brand-new storage credential, bootstrap once:

```hcl
databricks_storage_credential_external_id = "bootstrap"
skip_databricks_validation               = true
```

Run the first apply:

```bash
terraform init
terraform apply
```

This first apply may stop after creating the Databricks storage credential or
after creating some later Databricks objects. That is acceptable during
bootstrap. The purpose of the first pass is to create the storage credential so
Databricks can report the generated external ID.

Read the real external ID from Terraform state:

```bash
terraform output storage_credential_external_id
```

Put that output value back into `terraform.tfvars`:

```hcl
databricks_storage_credential_external_id = "<terraform-output-value>"
skip_databricks_validation               = false
databricks_storage_credential_force_update = true
```

Run the second apply:

```bash
terraform apply
```

This second apply updates the AWS IAM role trust policy from the placeholder
external ID to the real Databricks external ID, enables Databricks validation,
and finishes creating the external volume.

`databricks_storage_credential_force_update = true` is intentional. By the time
the second apply runs, the storage credential may already have dependent
external locations. Databricks requires the force option before Terraform can
turn validation back on for an in-use credential.

This mirrors Databricks' AWS storage credential flow: create the credential,
learn the generated external ID, then update the IAM trust policy with the real
value.

If you forget this second step, Databricks metadata resources may be created
with validation skipped, but the first operation that actually touches S3 will
fail with a cloud-provider error like:

```text
cannot create volume: Access denied. Cause: 403 Forbidden error from cloud storage provider
```

That means the IAM role trust policy still has the placeholder external ID.
Run:

```bash
terraform output storage_credential_external_id
```

Then put that value in `terraform.tfvars` and set:

```hcl
skip_databricks_validation = false
databricks_storage_credential_force_update = true
```

`cannot update storage credential: ... dependent storage location(s); use force option`

The storage credential already has external locations attached. Keep this in
`terraform.tfvars` and rerun `terraform apply`:

```hcl
databricks_storage_credential_force_update = true
```

## Databricks Catalog Managed Storage

Some Databricks metastores do not have a usable default managed storage root for
catalog creation through Terraform. In that case Databricks returns:

```text
cannot create catalog: Metastore storage root URL does not exist
```

This Terraform configuration avoids that by giving the catalog an explicit
managed storage root:

```text
s3://<bucket>/__databricks_managed/running_signals
```

Terraform also creates a Databricks external location for that path and grants
the same Unity Catalog IAM role access to both the raw Garmin prefix and this
managed catalog prefix.

## Default Schema Cleanup

Databricks may auto-create a `default` schema when the `running_signals` catalog
is created. This project does not use that schema. Terraform removes it during
apply when:

```hcl
drop_default_schema = true
```

The `bronze`, `silver`, and `gold` schemas remain managed by Terraform as
`databricks_schema.bronze`, `databricks_schema.silver`, and `databricks_schema.gold`.

## Commands

Brand-new setup:

```bash
cd infra/terraform
terraform init

# First pass: bootstrap Databricks storage credential.
# terraform.tfvars:
# databricks_storage_credential_external_id = "bootstrap"
# skip_databricks_validation = true
terraform plan
terraform apply

terraform output storage_credential_external_id

# Edit terraform.tfvars:
# databricks_storage_credential_external_id = "<output-value>"
# skip_databricks_validation = false
# databricks_storage_credential_force_update = true
terraform plan
terraform apply
```

Existing setup after the real external ID is already in `terraform.tfvars`:

```bash
cd infra/terraform
terraform plan
terraform apply
```

Expected final outputs:

```bash
terraform output raw_bucket_name
terraform output garmin_fit_s3_uri
terraform output garmin_fit_volume_path
```

Successful setup should produce:

```text
raw_bucket_name = "running-signals-raw-<aws_account_id>"
garmin_fit_s3_uri = "s3://running-signals-raw-<aws_account_id>/garmin/fit"
garmin_fit_volume_path = "/Volumes/running_signals/bronze/raw_garmin/fit"
```

Verify AWS can see the bucket:

```bash
AWS_PROFILE=running-signals-dev aws s3 ls s3://$(terraform output -raw raw_bucket_name)
```

Verify Databricks bundle configuration still targets the external volume path:

```bash
cd ../../databricks
uv run databricks bundle validate
```

After these checks pass, run the Garmin FIT S3 landing smoke test documented in
`scripts/README.md`.

The default bucket name is account-specific:

```text
running-signals-raw-${aws_account_id}
```

Garmin FIT files land at:

```text
s3://<bucket>/garmin/fit/{garmin_activity_id}.fit
```

Databricks reads the same files through the external Unity Catalog volume:

```text
/Volumes/running_signals/bronze/raw_garmin/fit/{garmin_activity_id}.fit
```
