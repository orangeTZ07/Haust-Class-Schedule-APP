const COMMANDS: &[&str] = &["install", "can_install", "launch_app", "request_install_permission"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .build();
}
