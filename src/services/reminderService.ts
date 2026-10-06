import { invoke } from "@tauri-apps/api/core";
import { requestPermission } from "@tauri-apps/plugin-notification";

/// The commands live in the native plugin (Kotlin on Android, Swift on iOS). Tauri maps the
/// snake_case names declared in the plugin's build.rs onto the camelCase native methods.
const PREFIX = "plugin:reminder";

// Deliberately no platform sniffing here. An earlier revision gated every call behind
// /Android/i.test(navigator.userAgent) and returned early when it did not match -- so a wrong
// guess turned the whole feature into a silent no-op that looked identical to a broken one. The
// Rust side answers honestly instead: a platform without an implementation returns a readable
// error, and the caller surfaces it.
//
// The payload is wrapped under `args`, and that key is not decorative. Tauri matches the payload
// against the *parameter names* of the Rust command, which is why the official plugins look like
// `invoke('plugin:dialog|open', { options })` for `fn open(app, options)`. Our commands are
// declared as `fn set_reminder(app, args: SetReminderArgs)`, so Tauri looks for a key named
// `args`; sending the fields flat failed deserialisation and every reminder call was rejected
// before it ever reached the native side. The fields *inside* stay camelCase because
// SetReminderArgs is declared with `#[serde(rename_all = "camelCase")]`.

export async function setReminder(
  courseScheduleId: number,
  triggerAt: number,
  title: string,
  body: string
): Promise<void> {
  await invoke(`${PREFIX}|set_reminder`, {
    args: { courseScheduleId, triggerAt, title, body }
  });
}

export async function cancelReminder(courseScheduleId: number): Promise<void> {
  await invoke(`${PREFIX}|cancel_reminder`, { args: { courseScheduleId } });
}

export async function checkBatteryOptimization(): Promise<boolean> {
  try {
    const result = await invoke<{ isIgnoring?: boolean }>(`${PREFIX}|check_battery_optimization`);
    return !!result?.isIgnoring;
  } catch {
    // Only drives a hint in the UI, so a failure is reported as "not exempt" rather than thrown.
    return false;
  }
}

/// Android: ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS with this package, then the
/// IGNORE_BATTERY_OPTIMIZATION_SETTINGS list if already exempt or the OEM hid the dialog.
export async function openBatterySettings(): Promise<void> {
  await invoke(`${PREFIX}|open_battery_settings`);
}

/// Opens this app's notification page in the system Settings app.
/// Public settings screen only: vendor autostart activities are not stable enough to call.
export async function openNotificationSettings(): Promise<void> {
  await invoke(`${PREFIX}|open_notification_settings`);
}

/// What the OS currently says about showing notifications. "prompt" means it has not been asked
/// yet (or, on Android 13+, was refused once and may be asked again).
export type NotificationPermissionState = "granted" | "denied" | "prompt";

/// Reads the live state from tauri-plugin-notification's command instead of calling the plugin's
/// `isPermissionGranted()`. That helper answers from `window.Notification.permission`, which the
/// plugin's init script fills in once at page load and never refreshes -- so after the user flips
/// the switch in system settings and comes back, it keeps returning the old answer. The command
/// returns true / false / null (not asked yet) straight from the OS.
export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  const granted = await invoke<boolean | null>("plugin:notification|is_permission_granted");
  if (granted === null) return "prompt";
  return granted ? "granted" : "denied";
}

/// Asks the OS. Where the system dialog has already been used up (iOS after the first answer,
/// Android after a permanent refusal) this returns "denied" immediately without showing anything,
/// which is why callers need to be able to tell the user to use system settings instead.
export async function requestNotificationPermissionState(): Promise<NotificationPermissionState> {
  const result = await requestPermission();
  if (result === "granted") return "granted";
  if (result === "denied") return "denied";
  return "prompt";
}
