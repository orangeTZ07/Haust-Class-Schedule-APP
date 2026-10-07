use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

// The real implementation lives in `mobile` on Android; every other platform
// (desktop and iOS) uses the `desktop` stub, which reports "unsupported".
#[cfg(target_os = "android")]
mod mobile;
#[cfg(not(target_os = "android"))]
mod desktop;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(target_os = "android")]
use mobile::AndroidInstaller;
#[cfg(not(target_os = "android"))]
use desktop::AndroidInstaller;

/// Extends [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] with the
/// android-installer APIs.
pub trait AndroidInstallerExt<R: Runtime> {
  fn android_installer(&self) -> &AndroidInstaller<R>;
}

impl<R: Runtime, T: Manager<R>> crate::AndroidInstallerExt<R> for T {
  fn android_installer(&self) -> &AndroidInstaller<R> {
    self.state::<AndroidInstaller<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("android-installer")
    .invoke_handler(tauri::generate_handler![
      commands::install,
      commands::can_install,
      commands::request_install_permission
    ])
    .setup(|app, api| {
      #[cfg(target_os = "android")]
      let android_installer = mobile::init(app, api)?;
      #[cfg(not(target_os = "android"))]
      let android_installer = desktop::init(app, api)?;
      app.manage(android_installer);
      Ok(())
    })
    .build()
}
