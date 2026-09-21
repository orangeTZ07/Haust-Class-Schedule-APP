import { ref, watch } from "vue";
import { useCourses } from "@/composables/useCourses";
import { cancelReminder, setReminder, reminderSupported } from "@/services/reminderService";

/// 只排未来这么多天。一周七天里，同一门课恰好出现一次，而 Kotlin 侧是用 schedule id 作为
/// PendingIntent 的 request code —— 也就是「一个日程只能挂一个闹钟」。两者刚好对上，所以七天
/// 是既不会互相覆盖、又不需要额外去重的窗口长度。窗口在每次打开应用时整体前移。
const WINDOW_DAYS = 7;

const STORAGE_KEY = "course-mngr-reminder";
const REGISTERED_KEY = "course-mngr-reminder-registered";

const DEFAULT_MINUTES_BEFORE = 10;
const MAX_MINUTES_BEFORE = 120;

interface ReminderPrefs {
  enabled: boolean;
  minutesBefore: number;
}

const prefs = ref<ReminderPrefs>({ enabled: false, minutesBefore: DEFAULT_MINUTES_BEFORE });

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    prefs.value = { ...prefs.value, ...JSON.parse(raw) };
  }
} catch {
  // A corrupt preference must not stop the app from starting; defaults are usable.
}

/// Local midnight for a date, so adding minutes lands on the intended wall-clock time.
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function readRegistered(): number[] {
  try {
    const raw = localStorage.getItem(REGISTERED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "number") : [];
  } catch {
    return [];
  }
}

function writeRegistered(ids: number[]) {
  localStorage.setItem(REGISTERED_KEY, JSON.stringify(ids));
}

export function useReminder() {
  const {
    courses,
    semesterWeekCount,
    weekNumberForDate,
    getSchedulesForWeek,
    getPeriodStartMinutes
  } = useCourses();

  watch(prefs, () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs.value));
  }, { deep: true });

  /// Registers one alarm per class meeting in the next WINDOW_DAYS, and cancels the ones that no
  /// longer qualify. Returns what it did so the settings screen can show it -- silently scheduling
  /// nothing is indistinguishable from a broken feature.
  const reschedule = async (): Promise<{ scheduled: number; cancelled: number; supported: boolean }> => {
    if (!reminderSupported) {
      return { scheduled: 0, cancelled: 0, supported: false };
    }

    const previously = readRegistered();
    const now = Date.now();

    if (!prefs.value.enabled) {
      for (const id of previously) {
        try {
          await cancelReminder(id);
        } catch {
          // Best effort: a stale alarm the platform refuses to drop is not worth failing over.
        }
      }
      writeRegistered([]);
      return { scheduled: 0, cancelled: previously.length, supported: true };
    }

    const scheduled: number[] = [];
    const today = startOfDay(new Date());

    for (let offset = 0; offset < WINDOW_DAYS; offset++) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      const week = weekNumberForDate(day);
      // Outside the semester, or before it starts: nothing is timetabled.
      if (week === null || week > semesterWeekCount.value) continue;

      // getDay() puts Sunday at 0; the timetable counts Monday as 1.
      const weekday = day.getDay() === 0 ? 7 : day.getDay();

      for (const schedule of getSchedulesForWeek(week)) {
        if (schedule.dayOfWeek !== weekday) continue;

        const startMinutes = getPeriodStartMinutes(schedule.startPeriod);
        if (startMinutes === null) continue;

        const triggerAt =
          new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, startMinutes).getTime() -
          prefs.value.minutesBefore * 60000;
        // Already past -- e.g. a class earlier today. AlarmManager would fire it immediately.
        if (triggerAt <= now) continue;

        const course = courses.value.find((item) => item.id === schedule.courseId);
        const title = course?.name ? `即将上课：${course.name}` : "即将上课";
        const body = [
          `${clock(startMinutes)} 开始`,
          `第 ${schedule.startPeriod}-${schedule.endPeriod} 节`,
          course?.location || ""
        ].filter(Boolean).join(" · ");

        try {
          await setReminder(schedule.id, triggerAt, title, body);
          scheduled.push(schedule.id);
        } catch {
          // One rejected alarm must not abort the rest of the window.
        }
      }
    }

    // Anything the platform still holds for schedules that did not re-qualify would fire for a
    // class that has been moved or deleted since.
    const stale = previously.filter((id) => !scheduled.includes(id));
    for (const id of stale) {
      try {
        await cancelReminder(id);
      } catch {
        // Best effort.
      }
    }
    writeRegistered(scheduled);

    return { scheduled: scheduled.length, cancelled: stale.length, supported: true };
  };

  return {
    prefs,
    reminderSupported,
    maxMinutesBefore: MAX_MINUTES_BEFORE,
    reschedule
  };
}
