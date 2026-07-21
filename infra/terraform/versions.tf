terraform {
  required_version = ">= 1.6.0"

  required_providers {
    databricks = {
      source  = "databricks/databricks"
      version = "~> 1.80"
    }
  }
}

provider "databricks" {
  profile = var.databricks_profile
}
