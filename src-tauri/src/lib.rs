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
        // The reminder commands live in the plugin and are reached as
        // `plugin:reminder|set_reminder`. Four stubs of the same name used to be registered here
        // as app commands, which meant `invoke("set_reminder")` resolved to a function that
        // returned Ok(()) having done nothing -- a second, silently useless copy of the API.
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
