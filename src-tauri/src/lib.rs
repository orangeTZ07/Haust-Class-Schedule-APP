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
        // 教务系统的请求走它。用官方插件而不是自己发请求的原因：WebView 里直接 fetch 会被
        // 同源策略拦住，而登录要跨到 cas.haust.edu.cn 和 jwgl.haust.edu.cn 两个域。
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_reminder::init()) // 重新启用
        // The reminder commands live in the plugin and are reached as
        // `plugin:reminder|set_reminder`. Four stubs of the same name used to be registered here
        // as app commands, which meant `invoke("set_reminder")` resolved to a function that
        // returned Ok(()) having done nothing -- a second, silently useless copy of the API.
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
