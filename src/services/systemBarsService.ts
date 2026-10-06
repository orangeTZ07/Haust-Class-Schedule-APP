import { addPluginListener, invoke, type PluginListener } from "@tauri-apps/api/core";

/// The commands live in the native plugin src-tauri/plugins/system-bars. On Android it reads the
/// real status bar / navigation bar / cutout sizes; on iOS and desktop it answers with zeros and
/// reports success, so nothing here has to know which platform it runs on.
const PLUGIN = "system-bars";
const PREFIX = `plugin:${PLUGIN}`;

/// Sizes in CSS pixels, already divided by the screen density on the native side.
export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/// The names variables.css reads (`--safe-top: max(env(safe-area-inset-top), var(--native-safe-top))`
/// and so on). Kept in one place because the Kotlin side writes the same four names by hand.
const CSS_VARIABLES: Record<keyof SafeInsets, string> = {
  top: "--native-safe-top",
  right: "--native-safe-right",
  bottom: "--native-safe-bottom",
  left: "--native-safe-left"
};

export function getInsets(): Promise<SafeInsets> {
  return invoke<SafeInsets>(`${PREFIX}|get_insets`);
}

/// `darkIcons: true` draws dark status / navigation bar icons, which is what a light background
/// needs. The key is sent flat because the Rust command takes a bare `dark_icons` parameter, and
/// Tauri matches the payload against parameter names.
export async function setBarStyle(darkIcons: boolean): Promise<void> {
  await invoke(`${PREFIX}|set_bar_style`, { darkIcons });
}

/// Subscribes to the native `insetsChanged` event (rotation, switching between gesture and
/// three-button navigation, ...). Resolves to a handle whose `unregister()` stops it.
///
/// `addPluginListener` goes through `register_listener`, which the plugin's default permission
/// allows; on desktop and iOS that command exists and does nothing, so this resolves there too.
export function listenInsets(callback: (insets: SafeInsets) => void): Promise<PluginListener> {
  return addPluginListener<SafeInsets>(PLUGIN, "insetsChanged", callback);
}

/// Writes the four `--native-safe-*` variables onto <html>. The page's own `--safe-*` variables
/// take max() of these and env(safe-area-inset-*), so a WebView that does fill env() is not counted
/// twice. Anything that is not a positive finite number becomes 0px instead of an invalid length,
/// which would make the whole `max()` declaration drop out.
export function applyInsetsToCss(insets: SafeInsets, root: HTMLElement = document.documentElement): void {
  for (const side of Object.keys(CSS_VARIABLES) as (keyof SafeInsets)[]) {
    const value = insets?.[side];
    const px = typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
    root.style.setProperty(CSS_VARIABLES[side], `${px}px`);
  }
}
