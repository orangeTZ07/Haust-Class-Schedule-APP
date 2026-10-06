use serde::de::DeserializeOwned;
use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{AppHandle, Runtime};

use crate::{Insets, SetBarStyleArgs};

/// The package the Kotlin classes live in. It has to match `namespace` in android/build.gradle and
/// the `package` line of SystemBarsPlugin.kt -- register_android_plugin resolves the class through
/// this string, and a mismatch registers nothing while still reporting success upstream.
const PLUGIN_IDENTIFIER: &str = "com.coursemngr.systembars";

/// Registers the Kotlin plugin with the mobile runtime.
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<SystemBars<R>, Box<dyn std::error::Error>> {
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "SystemBarsPlugin")?;
    Ok(SystemBars(handle))
}

/// Handle to the native plugin.
pub struct SystemBars<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> SystemBars<R> {
    // run_mobile_plugin takes the Kotlin method name, which is camelCase; the snake_case names are
    // what the frontend invokes, and Tauri maps between the two on its side.

    pub fn get_insets(&self) -> Result<Insets, String> {
        self.0
            .run_mobile_plugin::<Insets>("getInsets", ())
            .map_err(|error| error.to_string())
    }

    pub fn set_bar_style(&self, dark_icons: bool) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<serde_json::Value>("setBarStyle", SetBarStyleArgs { dark_icons })
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}
