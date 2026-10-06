package com.coursemngr.reminder

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

object WhitelistHelper {

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    /// One-tap system dialog first. The list is only for "already exempt" or OEMs that hide the
    /// dialog: ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS is the usual Android path, but some
    /// vendors remove that activity, and starting it then throws.
    fun requestIgnoreOrOpenList(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        if (isIgnoringBatteryOptimizations(context)) {
            openBatteryOptimizationSettings(context)
            return
        }
        try {
            start(context, requestIgnoreIntent(context))
        } catch (_: Exception) {
            openBatteryOptimizationSettings(context)
        }
    }

    fun openBatteryOptimizationSettings(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        start(context, Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    /// Package URI is required; without it the system dialog has nothing to exempt.
    private fun requestIgnoreIntent(context: Context): Intent {
        return Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
    }

    private fun start(context: Context, intent: Intent) {
        if (context !is Activity) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
