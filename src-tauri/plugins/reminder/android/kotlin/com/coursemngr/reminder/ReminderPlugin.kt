package com.coursemngr.reminder

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin

@TauriPlugin
class ReminderPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun setReminder(invoke: Invoke) {
        // TODO: 调用 AlarmScheduler 设置闹钟
        invoke.resolve()
    }

    @Command
    fun cancelReminder(invoke: Invoke) {
        // TODO: 取消闹钟
        invoke.resolve()
    }

    @Command
    fun checkBatteryOptimization(invoke: Invoke) {
        // TODO: 检查电池优化状态
        val result = JSObject()
        result.put("isIgnoring", false)
        invoke.resolve(result)
    }

    @Command
    fun openBatterySettings(invoke: Invoke) {
        // TODO: 跳转电池优化设置页
        invoke.resolve()
    }
}
