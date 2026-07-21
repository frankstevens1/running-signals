variable "raw_bucket_name" {
  description = "Hetzner Object Storage bucket name for the raw Garmin landing zone."
  type        = string
}

variable "object_storage_access_key_id" {
  description = "Hetzner Object Storage access key ID."
  type        = string
  sensitive   = true
}

variable "object_storage_secret_access_key" {
  description = "Hetzner Object Storage secret access key."
  type        = string
  sensitive   = true
}

variable "object_storage_account_id" {
  description = "Account ID for the Cloudflare API TOKEN credential type. For Hetzner, use the project ID from the Hetzner Console URL (e.g., https://console.hetzner.com/projects/<project-ID>)."
  type        = string
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
  description = "Object prefix used by the Garmin FIT downloader."
  type        = string
  default     = "garmin/fit"
}

variable "health_object_prefix" {
  description = "Object prefix used by the Garmin health JSON downloader."
  type        = string
  default     = "garmin/health/daily"
}

variable "catalog_managed_storage_prefix" {
  description = "Object prefix used for Unity Catalog managed storage for the running_signals catalog."
  type        = string
  default     = "__databricks_managed/running_signals"
}

variable "databricks_profile" {
  description = "Optional Databricks CLI profile. Leave null to use Databricks environment variables."
  type        = string
  default     = null
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
