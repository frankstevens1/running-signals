variable "aws_region" {
  description = "AWS region for the raw Garmin landing bucket."
  type        = string
  default     = "eu-central-1"
}

variable "aws_profile" {
  description = "Optional AWS CLI profile Terraform should use. Prefer setting this in terraform.tfvars."
  type        = string
  default     = null
}

variable "raw_bucket_name" {
  description = "Optional explicit S3 bucket name. Defaults to running-signals-raw-<account_id>."
  type        = string
  default     = null
}

variable "raw_bucket_force_destroy" {
  description = "Whether Terraform may delete the raw bucket even when it contains objects."
  type        = bool
  default     = false
}

variable "catalog_name" {
  description = "Unity Catalog catalog name."
  type        = string
  default     = "running_signals"
}

variable "bronze_schema_name" {
  description = "Unity Catalog bronze schema name."
  type        = string
  default     = "bronze"
}

variable "silver_schema_name" {
  description = "Unity Catalog silver schema name."
  type        = string
  default     = "silver"
}

variable "gold_schema_name" {
  description = "Unity Catalog gold schema name."
  type        = string
  default     = "gold"
}

variable "drop_default_schema" {
  description = "Drop the auto-created default schema from the Unity Catalog catalog during Terraform apply."
  type        = bool
  default     = true
}

variable "raw_volume_name" {
  description = "Unity Catalog external volume name for raw Garmin files."
  type        = string
  default     = "raw_garmin"
}

variable "external_location_prefix" {
  description = "Bucket prefix registered as the Databricks external location."
  type        = string
  default     = "garmin"
}

variable "fit_object_prefix" {
  description = "S3 object prefix used by the Garmin FIT downloader."
  type        = string
  default     = "garmin/fit"
}

variable "health_object_prefix" {
  description = "S3 object prefix used by the Garmin health JSON downloader."
  type        = string
  default     = "garmin/health/daily"
}

variable "catalog_managed_storage_prefix" {
  description = "S3 prefix used for Unity Catalog managed storage for the running_signals catalog."
  type        = string
  default     = "__databricks_managed/running_signals"
}

variable "databricks_profile" {
  description = "Optional Databricks CLI profile. Leave null to use Databricks environment variables."
  type        = string
  default     = null
}

variable "databricks_storage_credential_external_id" {
  description = "External ID used in the AWS trust policy for the Databricks storage credential."
  type        = string
}

variable "skip_databricks_validation" {
  description = "Skip Databricks validation of the storage credential and external location."
  type        = bool
  default     = false
}

variable "databricks_storage_credential_force_update" {
  description = "Allow Databricks to update the storage credential when dependent external locations already exist."
  type        = bool
  default     = true
}
