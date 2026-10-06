// `register_listener` and `remove_listener` have no Rust implementation on Android: tauri forwards
// any command the plugin's invoke handler does not know to the Kotlin plugin of the same name
// (Plugin.registerListener / removeListener in tauri-android). They still have to be listed here,
// because the ACL check runs first and a command without a permission is rejected before it gets
// that far. `addPluginListener` in @tauri-apps/api calls exactly these two.
const COMMANDS: &[&str] = &[
    "get_insets",
    "set_bar_style",
    "register_listener",
    "remove_listener",
];

fn main() {
    // No ios_path: WKWebView fills env(safe-area-inset-*) itself, so iOS has no native side.
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
