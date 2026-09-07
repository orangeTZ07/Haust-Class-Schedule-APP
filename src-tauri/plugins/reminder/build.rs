fn main() {
    tauri_plugin::Builder::new(&[
        "set_reminder",
        "cancel_reminder",
        "check_battery_optimization",
        "open_battery_settings",
    ])
    .android_path("android")
    .build();
}
