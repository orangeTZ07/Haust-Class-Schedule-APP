use tauri::plugin::PluginApi;
use tauri::{AppHandle, Runtime};

use crate::Insets;

/// Desktop and iOS have nothing to report: a desktop window has no system bars drawn over the page,
/// and WKWebView fills env(safe-area-inset-*) itself. The commands still exist so the plugin loads
/// everywhere and the frontend never has to tell platforms apart; an all-zero answer is the one
/// that leaves the page layout exactly as it was before this plugin existed.
pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<SystemBars<R>, Box<dyn std::error::Error>> {
    Ok(SystemBars {
        _runtime: std::marker::PhantomData,
    })
}

pub struct SystemBars<R: Runtime> {
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> SystemBars<R> {
    pub fn get_insets(&self) -> Result<Insets, String> {
        Ok(Insets::default())
    }

    pub fn set_bar_style(&self, _dark_icons: bool) -> Result<(), String> {
        Ok(())
    }
}
