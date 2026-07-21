locals {
  storage_credential_name = "running_signals_raw_garmin_hos"
}

resource "databricks_storage_credential" "raw_garmin" {
  name            = local.storage_credential_name
  skip_validation = var.skip_databricks_validation
  force_update    = var.databricks_storage_credential_force_update
  comment         = "Hetzner Object Storage (Cloudflare API TOKEN type) credential for the raw Garmin landing zone."

  cloudflare_api_token {
    access_key_id     = var.object_storage_access_key_id
    secret_access_key = var.object_storage_secret_access_key
    account_id        = var.object_storage_account_id
  }
}
