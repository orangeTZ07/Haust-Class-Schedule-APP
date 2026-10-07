use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::AndroidInstallerExt;
use crate::Result;

#[command]
pub(crate) async fn install<R: Runtime>(app: AppHandle<R>, path: String) -> Result<()> {
  app.android_installer().install(InstallRequest { path })
}

#[command]
pub(crate) async fn can_install<R: Runtime>(app: AppHandle<R>) -> Result<bool> {
  app.android_installer().can_install()
}

#[command]
pub(crate) async fn request_install_permission<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  app.android_installer().request_install_permission()
}
