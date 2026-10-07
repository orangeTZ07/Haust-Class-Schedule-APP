const COMMANDS: &[&str] = &["install", "can_install", "request_install_permission"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .build();
}
