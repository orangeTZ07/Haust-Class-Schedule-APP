use serde::Deserialize;
use tauri::command;

#[derive(Debug, Deserialize)]
pub struct SetReminderArgs {
    pub course_schedule_id: i64,
    pub trigger_at: i64,
    pub title: String,
    pub body: String,
}

#[command]
pub fn set_reminder(args: SetReminderArgs) -> Result<(), String> {
    // TODO: 调用 Android AlarmManager
    Ok(())
}

#[command]
pub fn cancel_reminder(course_schedule_id: i64) -> Result<(), String> {
    // TODO: 取消闹钟
    Ok(())
}

#[command]
pub fn check_battery_optimization() -> Result<bool, String> {
    // TODO: 检查电池优化状态
    Ok(false)
}

#[command]
pub fn open_battery_settings() -> Result<(), String> {
    // TODO: 跳转电池优化设置页
    Ok(())
}
