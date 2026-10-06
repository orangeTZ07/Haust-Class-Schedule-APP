import { invoke } from "@tauri-apps/api/core";

/// The commands live in Kotlin, so they only do anything on Android. Tauri maps the snake_case
/// names declared in the plugin's build.rs onto the camelCase Kotlin methods.
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
// before it ever reached Kotlin. The fields *inside* stay camelCase because SetReminderArgs is
// declared with `#[serde(rename_all = "camelCase")]`.

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

export async function openBatterySettings(): Promise<void> {
  await invoke(`${PREFIX}|open_battery_settings`);
}
