package com.coursemngr.reminder

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/// Arguments for set_reminder. @InvokeArg classes carry the JSON keys the frontend sends, so the
/// properties stay camelCase even though the command names are snake_case.
@InvokeArg
class SetReminderArgs {
    var courseScheduleId: Long = 0
    var triggerAt: Long = 0
    var title: String? = null
    var body: String? = null
}

@InvokeArg
class CancelReminderArgs {
    var courseScheduleId: Long = 0
}

/// This file previously imported only Command and TauriPlugin, so Plugin, Invoke and JSObject were
/// unresolved and the module could not compile -- which is the likely reason the Android build was
/// not including it, leaving every @Command here unreachable. The imports below match the ones a
/// released Tauri plugin uses (app.tauri.plugin.Plugin / Invoke / JSObject).
///
/// Commands are registered with the frontend as `plugin:reminder|set_reminder` and so on: build.rs
/// declares the snake_case names, and Tauri maps them onto these camelCase methods.
@TauriPlugin
class ReminderPlugin(private val activity: Activity) : Plugin(activity) {

    private val context get() = activity.applicationContext

    @Command
    fun setReminder(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetReminderArgs::class.java)
            if (args.triggerAt <= System.currentTimeMillis()) {
                // Scheduling a moment that has already passed would fire instantly or not at all,
                // depending on the OEM; rejecting is the honest answer.
                invoke.reject("提醒时间已经过去了")
                return
            }
            AlarmScheduler(context).schedule(
                args.courseScheduleId,
                args.triggerAt,
                args.title ?: "课程提醒",
                args.body ?: "即将上课"
            )
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject(e.message ?: "设置提醒失败")
        }
    }

    @Command
    fun cancelReminder(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(CancelReminderArgs::class.java)
            AlarmScheduler(context).cancel(args.courseScheduleId)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject(e.message ?: "取消提醒失败")
        }
    }

    @Command
    fun checkBatteryOptimization(invoke: Invoke) {
        try {
            val result = JSObject()
            result.put("isIgnoring", WhitelistHelper.isIgnoringBatteryOptimizations(context))
            invoke.resolve(result)
        } catch (e: Exception) {
            invoke.reject(e.message ?: "检查电池优化失败")
        }
    }

    @Command
    fun openBatterySettings(invoke: Invoke) {
        try {
            WhitelistHelper.openBatteryOptimizationSettings(context)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject(e.message ?: "无法打开电池优化设置页")
        }
    }
}
