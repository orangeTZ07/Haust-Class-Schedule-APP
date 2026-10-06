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
        // 「检查更新」要把用户带去浏览器下载新版 APK。能打开哪些网址由 capabilities 里的 scope 限定。
        .plugin(tauri_plugin_opener::init())
        // 教务系统的请求走它。用官方插件而不是自己发请求的原因：WebView 里直接 fetch 会被
        // 同源策略拦住，而登录要跨到 cas.haust.edu.cn 和 jwgl.haust.edu.cn 两个域。
        .plugin(tauri_plugin_http::init())
        // Must stay after tauri_plugin_notification. On iOS that plugin makes itself the only
        // UNUserNotificationCenter delegate and force-unwraps a lookup that only knows its own
        // notifications, so a class reminder shown in the foreground or tapped would crash the app.
        // The reminder plugin installs a delegate that handles its own notifications and forwards
        // the rest; registering it first would let the notification plugin replace that delegate.
        .plugin(tauri_plugin_reminder::init())
        // The reminder commands live in the plugin and are reached as
        // `plugin:reminder|set_reminder`. Four stubs of the same name used to be registered here
        // as app commands, which meant `invoke("set_reminder")` resolved to a function that
        // returned Ok(()) having done nothing -- a second, silently useless copy of the API.
        // system-bars is independent of everything above, so its position here does not matter. It
        // reads the Android status bar, navigation bar and cutout sizes and writes them into the
        // page as --native-safe-* CSS variables.
        .plugin(tauri_plugin_system_bars::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
