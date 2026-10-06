use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};

// Only Android has a native side. iOS gets the no-op implementation too: WKWebView exposes the real
// safe area through env(safe-area-inset-*) on its own, so there is nothing for Swift to add.
#[cfg(target_os = "android")]
mod android;
#[cfg(not(target_os = "android"))]
mod noop;

mod commands;

#[cfg(target_os = "android")]
pub use android::SystemBars;
#[cfg(not(target_os = "android"))]
pub use noop::SystemBars;

/// System bar and display cutout sizes in CSS pixels, i.e. already divided by the screen density.
/// The Kotlin side builds the same four keys by hand, so a rename here has to be mirrored in
/// SafeInsets.toJSObject there.
#[derive(Debug, Default, Clone, Copy, Serialize, Deserialize)]
pub struct Insets {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

/// Payload of `setBarStyle`. The Kotlin @InvokeArg class reads the camelCase key directly.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBarStyleArgs {
    pub dark_icons: bool,
}

/// Extensions to reach the system bars API from Rust.
pub trait SystemBarsExt<R: Runtime> {
    fn system_bars(&self) -> &SystemBars<R>;
}

impl<R: Runtime, T: Manager<R>> SystemBarsExt<R> for T {
    fn system_bars(&self) -> &SystemBars<R> {
        self.state::<SystemBars<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("system-bars")
        // The frontend reaches these as `plugin:system-bars|<name>`.
        //
        // The two listener commands are registered on non-Android targets only. On Android they
        // are deliberately absent so tauri forwards them to Kotlin, where the base Plugin class
        // implements them and `trigger("insetsChanged", ..)` finds its subscribers. Everywhere
        // else they answer with success and never fire, so the frontend can subscribe the same
        // way on every platform instead of catching a "command not found" on desktop and iOS.
        .invoke_handler(tauri::generate_handler![
            commands::get_insets,
            commands::set_bar_style,
            #[cfg(not(target_os = "android"))]
            commands::register_listener,
            #[cfg(not(target_os = "android"))]
            commands::remove_listener,
        ])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let system_bars = android::init(app, api)?;
            #[cfg(not(target_os = "android"))]
            let system_bars = noop::init(app, api)?;
            app.manage(system_bars);
            Ok(())
        })
        .build()
}
