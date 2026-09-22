use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};

#[cfg(target_os = "android")]
mod mobile;
#[cfg(not(target_os = "android"))]
mod desktop;

mod commands;

#[cfg(target_os = "android")]
pub use mobile::Reminder;
#[cfg(not(target_os = "android"))]
pub use desktop::Reminder;

/// Payload types. The Kotlin @InvokeArg classes read the JSON keys directly, so these rename to
/// camelCase -- the Rust field names never reach the other side.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetReminderArgs {
    pub course_schedule_id: i64,
    pub trigger_at: i64,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelReminderArgs {
    pub course_schedule_id: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryStatus {
    pub is_ignoring: bool,
}

/// Extensions to reach the reminder API from Rust.
pub trait ReminderExt<R: Runtime> {
    fn reminder(&self) -> &Reminder<R>;
}

impl<R: Runtime, T: Manager<R>> ReminderExt<R> for T {
    fn reminder(&self) -> &Reminder<R> {
        self.state::<Reminder<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("reminder")
        // These commands are the entry point the frontend reaches as `plugin:reminder|<name>`.
        // Each forwards to the Kotlin @Command of the same meaning through run_mobile_plugin. The
        // list was previously empty, so the name resolved to nothing and every reminder call
        // failed -- silently, because the calling code discarded the rejection.
        .invoke_handler(tauri::generate_handler![
            commands::set_reminder,
            commands::cancel_reminder,
            commands::check_battery_optimization,
            commands::open_battery_settings,
        ])
        // The native plugin has to be registered here. Without this setup hook the Kotlin class is
        // never instantiated on Android, so run_mobile_plugin has no instance to reach.
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let reminder = mobile::init(app, api)?;
            #[cfg(not(target_os = "android"))]
            let reminder = desktop::init(app, api)?;
            app.manage(reminder);
            Ok(())
        })
        .build()
}
