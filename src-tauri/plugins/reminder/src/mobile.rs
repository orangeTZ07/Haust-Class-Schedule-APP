use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{AppHandle, Runtime};

/// The package the Kotlin classes live in. It has to match `namespace` in android/build.gradle and
/// the `package` line of ReminderPlugin.kt -- register_android_plugin resolves the class through
/// this string, and a mismatch registers nothing at all while still reporting success upstream.
#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.coursemngr.reminder";

/// Registers the Kotlin plugin with the mobile runtime.
///
/// This is what makes the @Command methods reachable. Without it the native class is never
/// instantiated, so `plugin:reminder|set_reminder` from the frontend has nothing to dispatch to
/// and the feature is inert no matter how complete the Kotlin looks.
pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<Reminder<R>, Box<dyn std::error::Error>> {
    #[cfg(target_os = "android")]
    {
        let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "ReminderPlugin")?;
        return Ok(Reminder(handle));
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = api;
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "the reminder plugin has no native implementation for this target",
        )
        .into())
    }
}

/// Handle to the Kotlin plugin.
///
/// The commands are invoked straight from the frontend, so nothing calls through this handle yet.
/// It is held so the native plugin stays registered, and so Rust-side callers can be added later
/// without reworking the registration.
pub struct Reminder<R: Runtime>(#[allow(dead_code)] PluginHandle<R>);
