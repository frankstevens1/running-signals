data "aws_caller_identity" "current" {}

locals {
  raw_bucket_name                = coalesce(var.raw_bucket_name, "running-signals-raw-${data.aws_caller_identity.current.account_id}")
  external_location_prefix       = trimsuffix(trimprefix(var.external_location_prefix, "/"), "/")
  fit_object_prefix              = trimsuffix(trimprefix(var.fit_object_prefix, "/"), "/")
  catalog_managed_storage_prefix = trimsuffix(trimprefix(var.catalog_managed_storage_prefix, "/"), "/")
  databricks_profile_arg         = var.databricks_profile == null ? "" : " --profile ${var.databricks_profile}"
  iam_role_name                  = "running-signals-raw-garmin-uc"
  storage_credential_name        = "running_signals_raw_garmin_s3"
  external_location_name         = "running_signals_raw_garmin"
  managed_location_name          = "running_signals_catalog_managed"
}

resource "aws_s3_bucket" "raw" {
  bucket        = local.raw_bucket_name
  force_destroy = var.raw_bucket_force_destroy

  tags = {
    Project = "running-signals"
    Layer   = "raw"
  }
}

resource "aws_s3_bucket_public_access_block" "raw" {
  bucket = aws_s3_bucket.raw.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "raw" {
  bucket = aws_s3_bucket.raw.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw" {
  bucket = aws_s3_bucket.raw.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "raw" {
  bucket = aws_s3_bucket.raw.id

  versioning_configuration {
    status = "Enabled"
  }
}

data "databricks_aws_unity_catalog_assume_role_policy" "raw_garmin" {
  aws_account_id = data.aws_caller_identity.current.account_id
  role_name      = local.iam_role_name
  external_id    = var.databricks_storage_credential_external_id
}

resource "aws_iam_role" "raw_garmin_databricks" {
  name               = local.iam_role_name
  assume_role_policy = data.databricks_aws_unity_catalog_assume_role_policy.raw_garmin.json

  tags = {
    Project = "running-signals"
    Purpose = "databricks-uc-raw-garmin"
  }
}

data "aws_iam_policy_document" "raw_garmin_access" {
  statement {
    sid = "GetRawBucketLocation"

    actions = [
      "s3:GetBucketLocation",
    ]

    resources = [
      aws_s3_bucket.raw.arn,
    ]
  }

  statement {
    sid = "ListRawGarminPrefix"

    actions = [
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
    ]

    resources = [
      aws_s3_bucket.raw.arn,
    ]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values = [
        local.external_location_prefix,
        "${local.external_location_prefix}/*",
        local.catalog_managed_storage_prefix,
        "${local.catalog_managed_storage_prefix}/*",
      ]
    }
  }

  statement {
    sid = "ReadWriteRawGarminObjects"

    actions = [
      "s3:AbortMultipartUpload",
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:ListMultipartUploadParts",
      "s3:PutObject",
    ]

    resources = [
      "${aws_s3_bucket.raw.arn}/${local.external_location_prefix}/*",
      "${aws_s3_bucket.raw.arn}/${local.catalog_managed_storage_prefix}/*",
    ]
  }

  statement {
    sid = "AllowSelfAssumeRole"

    actions = [
      "sts:AssumeRole",
    ]

    resources = [
      aws_iam_role.raw_garmin_databricks.arn,
    ]
  }
}

resource "aws_iam_policy" "raw_garmin_access" {
  name   = "running-signals-raw-garmin-uc-access"
  policy = data.aws_iam_policy_document.raw_garmin_access.json

  tags = {
    Project = "running-signals"
    Purpose = "databricks-uc-raw-garmin"
  }
}

resource "aws_iam_role_policy_attachment" "raw_garmin_access" {
  role       = aws_iam_role.raw_garmin_databricks.name
  policy_arn = aws_iam_policy.raw_garmin_access.arn
}

resource "databricks_catalog" "running_signals" {
  name         = var.catalog_name
  storage_root = databricks_external_location.catalog_managed.url
  comment      = "Running Signals analytics engineering portfolio catalog."
}

resource "terraform_data" "drop_default_schema" {
  count = var.drop_default_schema ? 1 : 0

  input = {
    catalog_name           = databricks_catalog.running_signals.name
    databricks_profile_arg = local.databricks_profile_arg
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      if uv run databricks schemas get "${self.input.catalog_name}.default" ${self.input.databricks_profile_arg} >/dev/null 2>&1; then
        uv run databricks schemas delete "${self.input.catalog_name}.default" --force ${self.input.databricks_profile_arg}
      fi
    EOT
  }
}

resource "databricks_schema" "bronze" {
  catalog_name = databricks_catalog.running_signals.name
  name         = var.bronze_schema_name
  comment      = "Bronze layer for raw and source-aligned Running Signals data."

  depends_on = [
    terraform_data.drop_default_schema,
  ]
}

resource "databricks_storage_credential" "raw_garmin" {
  name            = local.storage_credential_name
  skip_validation = var.skip_databricks_validation
  force_update    = var.databricks_storage_credential_force_update
  comment         = "IAM role credential for the raw Garmin S3 landing zone."

  aws_iam_role {
    role_arn = aws_iam_role.raw_garmin_databricks.arn
  }

  depends_on = [
    aws_iam_role_policy_attachment.raw_garmin_access,
  ]
}

resource "databricks_external_location" "raw_garmin" {
  name            = local.external_location_name
  url             = "s3://${aws_s3_bucket.raw.bucket}/${local.external_location_prefix}"
  credential_name = databricks_storage_credential.raw_garmin.name
  skip_validation = var.skip_databricks_validation
  comment         = "S3-backed raw Garmin landing zone."
}

resource "databricks_external_location" "catalog_managed" {
  name            = local.managed_location_name
  url             = "s3://${aws_s3_bucket.raw.bucket}/${local.catalog_managed_storage_prefix}"
  credential_name = databricks_storage_credential.raw_garmin.name
  skip_validation = var.skip_databricks_validation
  comment         = "Managed storage root for the running_signals Unity Catalog catalog."
}

resource "databricks_volume" "raw_garmin" {
  catalog_name     = databricks_catalog.running_signals.name
  schema_name      = databricks_schema.bronze.name
  name             = var.raw_volume_name
  volume_type      = "EXTERNAL"
  storage_location = databricks_external_location.raw_garmin.url
  comment          = "External S3-backed volume for raw Garmin files."
}
