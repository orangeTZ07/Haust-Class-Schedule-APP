use serde::de::DeserializeOwned;
use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{AppHandle, Runtime};

use crate::{BatteryStatus, CancelReminderArgs, SetReminderArgs};

/// The package the Kotlin classes live in. It has to match `namespace` in android/build.gradle and
/// the `package` line of ReminderPlugin.kt -- register_android_plugin resolves the class through
/// this string, and a mismatch registers nothing while still reporting success upstream.
const PLUGIN_IDENTIFIER: &str = "com.coursemngr.reminder";

/// Registers the Kotlin plugin with the mobile runtime.
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<Reminder<R>, Box<dyn std::error::Error>> {
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "ReminderPlugin")?;
    Ok(Reminder(handle))
}

/// Handle to the Kotlin plugin.
pub struct Reminder<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Reminder<R> {
    // run_mobile_plugin takes the Kotlin method name, which is camelCase; the snake_case names are
    // what the frontend invokes, and Tauri maps between the two on its side.

    pub fn set_reminder(&self, args: SetReminderArgs) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<serde_json::Value>("setReminder", args)
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    pub fn cancel_reminder(&self, args: CancelReminderArgs) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<serde_json::Value>("cancelReminder", args)
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    pub fn check_battery_optimization(&self) -> Result<BatteryStatus, String> {
        self.0
            .run_mobile_plugin::<BatteryStatus>("checkBatteryOptimization", ())
            .map_err(|error| error.to_string())
    }

    pub fn open_battery_settings(&self) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<serde_json::Value>("openBatterySettings", ())
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}
