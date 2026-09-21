import { invoke } from "@tauri-apps/api/core";

/// The commands live in Kotlin, so they exist on Android only. Tauri maps the snake_case names
/// declared in the plugin's build.rs onto the camelCase methods in ReminderPlugin.kt.
const PREFIX = "plugin:reminder";

/// A Tauri Android WebView reports Android in its user agent, and this project has no OS-info
/// plugin to ask instead. Every call below is a no-op elsewhere, which keeps the desktop build
/// working rather than failing on a command that does not exist there.
const isAndroid = /Android/i.test(navigator.userAgent);

export const reminderSupported = isAndroid;

export async function setReminder(
  courseScheduleId: number,
  triggerAt: number,
  title: string,
  body: string
): Promise<void> {
  if (!isAndroid) return;
  await invoke(`${PREFIX}|set_reminder`, { courseScheduleId, triggerAt, title, body });
}

export async function cancelReminder(courseScheduleId: number): Promise<void> {
  if (!isAndroid) return;
  await invoke(`${PREFIX}|cancel_reminder`, { courseScheduleId });
}

export async function checkBatteryOptimization(): Promise<boolean> {
  if (!isAndroid) return false;
  try {
    const result = await invoke<{ isIgnoring?: boolean }>(`${PREFIX}|check_battery_optimization`);
    return !!result?.isIgnoring;
  } catch {
    // Reported as "not exempt" rather than thrown: this only drives a hint in the UI.
    return false;
  }
}

export async function openBatterySettings(): Promise<void> {
  if (!isAndroid) return;
  await invoke(`${PREFIX}|open_battery_settings`);
}
