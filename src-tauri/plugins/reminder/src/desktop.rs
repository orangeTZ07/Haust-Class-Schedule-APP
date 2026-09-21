use tauri::plugin::PluginApi;
use tauri::{AppHandle, Runtime};

/// Desktop has no reminder implementation: the feature is Android-only, and the plugin is
/// registered on every platform so that the frontend can check for it rather than fail to load.
pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<Reminder<R>, Box<dyn std::error::Error>> {
    Ok(Reminder {
        _runtime: std::marker::PhantomData,
    })
}

pub struct Reminder<R: Runtime> {
    _runtime: std::marker::PhantomData<R>,
}
