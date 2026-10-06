fn main() {
    tauri_plugin::Builder::new(&[
        "set_reminder",
        "cancel_reminder",
        "check_battery_optimization",
        "open_battery_settings",
        "open_notification_settings",
    ])
    .android_path("android")
    .ios_path("ios")
    .build();
}
