use tauri::{command, AppHandle, Runtime};

use crate::{BatteryStatus, CancelReminderArgs, ReminderExt, SetReminderArgs};

// Errors are Strings rather than a bespoke type: a Tauri command's error has to be Serialize, and
// the message is the useful part -- the frontend shows it verbatim.

#[command]
pub(crate) fn set_reminder<R: Runtime>(
    app: AppHandle<R>,
    args: SetReminderArgs,
) -> Result<(), String> {
    app.reminder().set_reminder(args)
}

#[command]
pub(crate) fn cancel_reminder<R: Runtime>(
    app: AppHandle<R>,
    args: CancelReminderArgs,
) -> Result<(), String> {
    app.reminder().cancel_reminder(args)
}

#[command]
pub(crate) fn check_battery_optimization<R: Runtime>(
    app: AppHandle<R>,
) -> Result<BatteryStatus, String> {
    app.reminder().check_battery_optimization()
}

#[command]
pub(crate) fn open_battery_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.reminder().open_battery_settings()
}
