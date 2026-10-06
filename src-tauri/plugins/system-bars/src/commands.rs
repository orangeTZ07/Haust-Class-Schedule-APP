use tauri::{command, AppHandle, Runtime};

use crate::{Insets, SystemBarsExt};

// Errors are Strings, as in the reminder plugin: a command's error has to be Serialize and the
// message is the part worth showing.
//
// The two that reach Kotlin are async. run_mobile_plugin blocks until the native side answers, and
// a plain `fn` command runs on the event loop thread; an async one blocks a runtime worker instead
// and leaves the event loop free. The official mobile plugins are written the same way.

#[command]
pub(crate) async fn get_insets<R: Runtime>(app: AppHandle<R>) -> Result<Insets, String> {
    app.system_bars().get_insets()
}

// The parameter is a bare `dark_icons` rather than an args struct, so the frontend sends
// `{ darkIcons }` flat: Tauri matches the payload against parameter names and camelCases them.
#[command]
pub(crate) async fn set_bar_style<R: Runtime>(
    app: AppHandle<R>,
    dark_icons: bool,
) -> Result<(), String> {
    app.system_bars().set_bar_style(dark_icons)
}

// `addPluginListener` sends `{ event, handler }` and `PluginListener.unregister` sends
// `{ event, channelId }`. Neither is read here: nothing ever fires on these targets, and a command
// ignores payload keys it has no parameter for.
#[cfg(not(target_os = "android"))]
#[command]
pub(crate) fn register_listener() {}

#[cfg(not(target_os = "android"))]
#[command]
pub(crate) fn remove_listener() {}
