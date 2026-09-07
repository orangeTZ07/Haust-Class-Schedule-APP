mod commands;
mod error;

pub use error::Error;

type Result<T> = std::result::Result<T, Error>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "android")]
    {
        std::panic::set_hook(Box::new(|info| {
            let msg = if let Some(s) = info.payload().downcast_ref::<&str>() {
                *s
            } else if let Some(s) = info.payload().downcast_ref::<String>() {
                &s[..]
            } else {
                "Box<Any>"
            };
            eprintln!("RUST PANIC: {}", msg);
        }));
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_reminder::init()) // 重新启用
        .invoke_handler(tauri::generate_handler![
            commands::reminder::set_reminder,
            commands::reminder::cancel_reminder,
            commands::reminder::check_battery_optimization,
            commands::reminder::open_battery_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
