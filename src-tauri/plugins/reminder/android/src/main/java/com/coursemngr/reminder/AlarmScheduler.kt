package com.coursemngr.reminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject

class AlarmScheduler(private val context: Context) {

    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun schedule(
        courseScheduleId: Long,
        triggerAtMillis: Long,
        title: String,
        body: String
    ) {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("course_schedule_id", courseScheduleId)
            putExtra("title", title)
            putExtra("body", body)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            courseScheduleId.toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // setAlarmClock: 最可靠的闹钟 API，系统视为用户可见闹钟
        val alarmClockInfo = AlarmManager.AlarmClockInfo(
            triggerAtMillis,
            pendingIntent
        )
        alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)

        // AlarmManager does not survive a reboot, and the plugin has no database of its own, so
        // each pending alarm is written down here for BootReceiver to replay. Without this every
        // reminder disappears silently after a restart until the app is next opened.
        remember(courseScheduleId, triggerAtMillis, title, body)
    }

    fun cancel(courseScheduleId: Long) {
        val intent = Intent(context, AlarmReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            courseScheduleId.toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
        forget(courseScheduleId)
    }

    /// Re-registers every stored alarm that is still in the future, dropping the ones that have
    /// already passed. Called on boot.
    fun restoreAll() {
        val now = System.currentTimeMillis()
        val pending = read()

        for ((id, entry) in pending) {
            if (entry.triggerAt <= now) continue
            schedule(id, entry.triggerAt, entry.title, entry.body)
        }

        // schedule() rewrites the store as it goes, so prune in one pass afterwards.
        write(pending.filterValues { it.triggerAt > now })
    }

    private data class Entry(val triggerAt: Long, val title: String, val body: String)

    private fun remember(id: Long, triggerAt: Long, title: String, body: String) {
        val pending = read().toMutableMap()
        pending[id] = Entry(triggerAt, title, body)
        write(pending)
    }

    private fun forget(id: Long) {
        val pending = read().toMutableMap()
        pending.remove(id)
        write(pending)
    }

    private fun read(): Map<Long, Entry> {
        val raw = prefs.getString(KEY_PENDING, null) ?: return emptyMap()
        return try {
            val json = JSONObject(raw)
            json.keys().asSequence().associate { key ->
                val item = json.getJSONObject(key)
                key.toLong() to Entry(
                    item.optLong("triggerAt"),
                    item.optString("title", "课程提醒"),
                    item.optString("body", "即将上课")
                )
            }
        } catch (e: Exception) {
            // A corrupt store must not crash the boot receiver; the reminders are recoverable by
            // opening the app, so starting from empty is the safe direction.
            emptyMap()
        }
    }

    private fun write(pending: Map<Long, Entry>) {
        val json = JSONObject()
        for ((id, entry) in pending) {
            json.put(
                id.toString(),
                JSONObject().apply {
                    put("triggerAt", entry.triggerAt)
                    put("title", entry.title)
                    put("body", entry.body)
                }
            )
        }
        prefs.edit().putString(KEY_PENDING, json.toString()).apply()
    }

    companion object {
        // Unused today but kept next to the store it describes; BootReceiver reads through the
        // public restoreAll() rather than touching prefs directly.
        const val PREFS_NAME = "course_reminder_prefs"
        const val KEY_PENDING = "pending_alarms"
    }
}
