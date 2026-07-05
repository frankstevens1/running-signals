output "raw_bucket_name" {
  description = "S3 bucket used as the canonical raw Garmin landing zone."
  value       = aws_s3_bucket.raw.bucket
}

output "garmin_fit_s3_uri" {
  description = "S3 URI where Garmin FIT files should be written."
  value       = "s3://${aws_s3_bucket.raw.bucket}/${local.fit_object_prefix}"
}

output "garmin_health_s3_uri" {
  description = "S3 URI where Garmin health JSON files should be written."
  value       = "s3://${aws_s3_bucket.raw.bucket}/${local.health_object_prefix}"
}

output "catalog_managed_storage_uri" {
  description = "S3 URI used as the Unity Catalog managed storage root for the running_signals catalog."
  value       = databricks_external_location.catalog_managed.url
}

output "raw_garmin_volume_path" {
  description = "Unity Catalog volume path for raw Garmin files."
  value       = databricks_volume.raw_garmin.volume_path
}

output "garmin_fit_volume_path" {
  description = "Databricks path consumed by the bronze FIT ingestion job."
  value       = "${databricks_volume.raw_garmin.volume_path}/fit"
}

output "garmin_health_volume_path" {
  description = "Databricks path consumed by the bronze health ingestion job."
  value       = "${databricks_volume.raw_garmin.volume_path}/health/daily"
}

output "storage_credential_external_id" {
  description = "External ID reported by Databricks for the storage credential."
  value       = databricks_storage_credential.raw_garmin.aws_iam_role[0].external_id
}
