# Terraform Infrastructure

Terraform manages the Hetzner Object Storage credential for the raw Garmin
landing zone. The catalog, schemas, and external locations are managed
separately (they already exist from the previous AWS setup).

State is local for this portfolio phase and is ignored by Git.

## Prerequisites

- Hetzner Object Storage bucket created via
  [Hetzner Console](https://console.hetzner.com/).
- Hetzner Object Storage access keys generated via
  **Security -> S3 Credentials -> Generate credentials**.
- Hetzner project ID from the console URL:
  `https://console.hetzner.com/projects/<project-ID>`.
- Databricks workspace authentication through environment variables or a CLI
  profile.

## Hetzner Object Storage Setup

### 1. Create S3 Credentials

1. Open [Hetzner Console](https://console.hetzner.com/) and select your project.
2. Go to **Security** on the left menu bar.
3. Go to **S3 Credentials** on the upper menu bar and select **Generate credentials**.
4. Enter a description and copy the displayed access key and secret key.
5. **Save the secret key** — it cannot be viewed again after closing the window.

### 2. Create a Bucket

Create a bucket using the MinIO Client, `s3cmd`, or `rclone`:

```bash
mc mb nbg1/datafluent
```

### 3. Find Your Project ID

The project ID is in the Hetzner Console URL when you have a project open:

```text
https://console.hetzner.com/projects/1234567/servers
```

The numeric part (`1234567`) is your project ID.

## Terraform Variables

Copy the sample variables file:

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
raw_bucket_name = "datafluent"

object_storage_access_key_id     = "<your-access-key-id>"
object_storage_secret_access_key = "<your-secret-access-key>"
object_storage_account_id        = "<your-hetzner-project-id>"
```

## Databricks Access to Hetzner

The Databricks "Cloudflare API TOKEN" credential type supports storing the
access keys, but it cannot be used to create Unity Catalog external locations
or volumes for `s3://` URIs — it only works with Cloudflare R2's `r2://` scheme.

For Databricks to read from Hetzner Object Storage, configure Spark at the
cluster or notebook level using Hadoop S3A configs:

```
spark.hadoop.fs.s3a.endpoint https://nbg1.your-objectstorage.com
spark.hadoop.fs.s3a.access.key <access-key>
spark.hadoop.fs.s3a.secret.key <secret-key>
spark.hadoop.fs.s3a.path.style.access true
```

Then the bronze notebooks can read directly using `s3a://datafluent/garmin/fit/`
instead of external volume paths. If external volumes are required, keep the
old AWS S3 external locations for legacy data and configure the Spark cluster
for Hetzner access for new data.

## Commands

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

Expected outputs:

```bash
terraform output raw_bucket_name
terraform output garmin_fit_url
```

