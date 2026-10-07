#[cfg(target_os = "android")]
use serde::Deserialize;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRequest {
  /// Absolute path to the `.apk` file. Must live under one of the plugin's
  /// FileProvider roots (the app's cache/files dirs) — see the README.
  pub path: String,
}

/// Shape returned by the Kotlin `canInstall` command.
#[cfg(target_os = "android")]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CanInstallResponse {
  pub can_install: bool,
}
