locals {
  fit_object_prefix    = trimsuffix(trimprefix(var.fit_object_prefix, "/"), "/")
  health_object_prefix = trimsuffix(trimprefix(var.health_object_prefix, "/"), "/")
}

output "raw_bucket_name" {
  description = "Hetzner Object Storage bucket used as the canonical raw Garmin landing zone."
  value       = var.raw_bucket_name
}

output "garmin_fit_url" {
  description = "Object storage URI where Garmin FIT files should be written."
  value       = "s3://${var.raw_bucket_name}/${local.fit_object_prefix}"
}

output "garmin_health_url" {
  description = "Object storage URI where Garmin health JSON files should be written."
  value       = "s3://${var.raw_bucket_name}/${local.health_object_prefix}"
}
