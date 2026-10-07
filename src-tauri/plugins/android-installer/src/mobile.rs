use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

// initializes the Kotlin plugin class
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<AndroidInstaller<R>> {
  let handle = api.register_android_plugin("dev.imal.tauri.androidinstaller", "InstallerPlugin")?;
  Ok(AndroidInstaller(handle))
}

/// Access to the android-installer APIs.
pub struct AndroidInstaller<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AndroidInstaller<R> {
  /// Launch the system installer for the APK at the given path.
  /// Resolves once the installer UI is launched; it cannot report whether the
  /// user completed the install (see the README).
  pub fn install(&self, payload: InstallRequest) -> crate::Result<()> {
    self.0.run_mobile_plugin("install", payload).map_err(Into::into)
  }

  /// Whether this app is currently allowed to install unknown apps.
  pub fn can_install(&self) -> crate::Result<bool> {
    self
      .0
      .run_mobile_plugin::<CanInstallResponse>("canInstall", ())
      .map(|r| r.can_install)
      .map_err(Into::into)
  }

  /// Open the system "install unknown apps" settings screen for this app.
  /// Resolves when the user returns; re-check [`can_install`](Self::can_install).
  pub fn request_install_permission(&self) -> crate::Result<()> {
    self
      .0
      .run_mobile_plugin("requestInstallPermission", ())
      .map_err(Into::into)
  }
}
