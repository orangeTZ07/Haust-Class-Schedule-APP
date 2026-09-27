package com.coursemngr.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val courseScheduleId = intent.getLongExtra("course_schedule_id", 0)
        val title = intent.getStringExtra("title") ?: "课程提醒"
        val body = intent.getStringExtra("body") ?: "即将上课"

        NotificationHelper.showReminder(context, courseScheduleId.toInt(), title, body)
    }
}
