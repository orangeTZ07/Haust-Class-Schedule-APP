use tauri::plugin::PluginApi;
use tauri::{AppHandle, Runtime};

use crate::{BatteryStatus, CancelReminderArgs, SetReminderArgs};

/// Desktop has no reminder implementation; Android and iOS are covered by mobile.rs.
///
/// The commands still exist so the plugin loads everywhere and the frontend receives a readable
/// message rather than a missing-command error. `check_battery_optimization` answers rather than
/// failing because it only drives a hint in the UI, and "nothing to optimise" is the answer that
/// keeps that hint hidden.
pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<Reminder<R>, Box<dyn std::error::Error>> {
    Ok(Reminder {
        _runtime: std::marker::PhantomData,
    })
}

pub struct Reminder<R: Runtime> {
    _runtime: std::marker::PhantomData<fn() -> R>,
}

const UNSUPPORTED: &str = "当前平台不支持上课提醒";

impl<R: Runtime> Reminder<R> {
    pub fn set_reminder(&self, _args: SetReminderArgs) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn cancel_reminder(&self, _args: CancelReminderArgs) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn check_battery_optimization(&self) -> Result<BatteryStatus, String> {
        Ok(BatteryStatus { is_ignoring: true })
    }

    pub fn open_battery_settings(&self) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn open_notification_settings(&self) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
}
