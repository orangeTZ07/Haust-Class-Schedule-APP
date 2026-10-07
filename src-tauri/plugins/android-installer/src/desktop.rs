use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;
use crate::Error;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<AndroidInstaller<R>> {
  Ok(AndroidInstaller(app.clone()))
}

/// Non-Android stub. APK installation is an Android-only capability.
pub struct AndroidInstaller<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> AndroidInstaller<R> {
  pub fn install(&self, _payload: InstallRequest) -> crate::Result<()> {
    Err(Error::Unsupported)
  }

  /// Always `false` off Android — there's nothing to install here. Returning a
  /// value (rather than erroring) lets cross-platform code use this as a guard.
  pub fn can_install(&self) -> crate::Result<bool> {
    Ok(false)
  }

  pub fn request_install_permission(&self) -> crate::Result<()> {
    Err(Error::Unsupported)
  }
}
