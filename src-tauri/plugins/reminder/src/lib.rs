use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

#[cfg(desktop)]
pub use desktop::Reminder;
#[cfg(mobile)]
pub use mobile::Reminder;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("reminder")
        .invoke_handler(tauri::generate_handler![])
        // The native plugin has to be registered here. Without this setup hook the Kotlin class is
        // never instantiated on Android, so its @Command methods cannot be reached from the
        // frontend even though build.rs declares them and the permissions grant them.
        .setup(|app, api| {
            #[cfg(mobile)]
            let reminder = mobile::init(app, api)?;
            #[cfg(desktop)]
            let reminder = desktop::init(app, api)?;
            app.manage(reminder);
            Ok(())
        })
        .build()
}
