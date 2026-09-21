package com.coursemngr.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/// AlarmManager forgets every alarm across a reboot, so the reminders the user scheduled have to
/// be put back. This receiver replays the plugin's own store (see AlarmScheduler): the course
/// data itself lives in the webview's SQLite database, which a BroadcastReceiver cannot read.
///
/// Only BOOT_COMPLETED is handled, not LOCKED_BOOT_COMPLETED: the latter fires while the device
/// is still locked, before credential-encrypted SharedPreferences are readable, so the store
/// would come back empty and the reminders would be dropped anyway.
///
/// This class has to be declared in AndroidManifest.xml. An undeclared receiver is never
/// instantiated, which is why scheduled reminders previously did nothing at all.
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        AlarmScheduler(context.applicationContext).restoreAll()
    }
}
