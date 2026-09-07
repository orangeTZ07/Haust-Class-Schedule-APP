use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

mod desktop;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("reminder")
        .invoke_handler(tauri::generate_handler![])
        .build()
}
