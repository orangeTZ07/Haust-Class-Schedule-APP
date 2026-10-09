import { effectScope, ref, watch } from "vue";
import { useCourses } from "@/composables/useCourses";
import {
  cancelReminder,
  getNotificationPermissionState,
  requestNotificationPermissionState,
  setReminder,
  type NotificationPermissionState
} from "@/services/reminderService";
import { describeError } from "@/utils/describeError";

/// 只排未来这么多天。一周七天里，同一门课恰好出现一次，而 Android 侧是用 schedule id 作为
/// PendingIntent 的 request code，iOS 侧是用它拼通知 identifier —— 也就是「一个日程只能挂一个
/// 提醒」。两者刚好对上，所以七天是既不会互相覆盖、又不需要额外去重的窗口长度。窗口在每次打开
/// 应用时整体前移。
const WINDOW_DAYS = 7;

/// iOS keeps at most 64 pending local notifications per app and silently drops the ones beyond
/// that, so an unbounded schedule would lose reminders without any error. Staying under the cap
/// with some headroom, and keeping the *nearest* ones, means the loss -- if a week ever holds this
/// many classes -- falls on the reminders furthest away, which the next refresh brings back.
/// Applied on both platforms because Android has no cap worth special-casing.
const MAX_REMINDERS = 60;

/// How long timetable edits are allowed to settle before the reminders are rewritten. An import or
/// a drag changes several things in quick succession; one rewrite after they stop is enough.
const REFRESH_DELAY_MS = 1500;

const STORAGE_KEY = "course-mngr-reminder";
const REGISTERED_KEY = "course-mngr-reminder-registered";
/// Set once the OS permission has been requested on the user's behalf at startup, so a refusal is
/// not answered by the same prompt on every launch.
const PERMISSION_ASKED_KEY = "course-mngr-reminder-permission-asked";

const DEFAULT_MINUTES_BEFORE = 20;
const MAX_MINUTES_BEFORE = 120;

interface ReminderPrefs {
  enabled: boolean;
  minutesBefore: number;
}

export interface RescheduleResult {
  scheduled: number;
  cancelled: number;
  /// The first native failure, shown verbatim.
  error?: string;
  /// Nothing was scheduled because the OS does not let the app show notifications.
  noPermission?: boolean;
}

/// The defaults are what someone with no stored preference gets: reminders on, 20 minutes ahead.
/// A stored preference is applied over them as-is, so an earlier choice -- including `enabled:
/// false` -- is never overridden. (This is the one place that decides "new install"; someone who
/// installed the first reminder release and never touched the switch has no stored preference and
/// is indistinguishable from a new install here.)
const prefs = ref<ReminderPrefs>({ enabled: true, minutesBefore: DEFAULT_MINUTES_BEFORE });

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    prefs.value = { ...prefs.value, ...JSON.parse(raw) };
  }
} catch {
  // A corrupt preference must not stop the app from starting; defaults are usable.
}

/// The OS-level notification permission as last observed. "unknown" until the first check, so the
/// settings page does not flash a warning before it knows anything.
const permission = ref<NotificationPermissionState | "unknown">("unknown");

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

const wasPermissionAsked = () => {
  try {
    return localStorage.getItem(PERMISSION_ASKED_KEY) === "1";
  } catch {
    return false;
  }
};

const markPermissionAsked = () => {
  try {
    localStorage.setItem(PERMISSION_ASKED_KEY, "1");
  } catch {
    // Worst case the startup prompt comes back next launch.
  }
};

/// Re-reads the permission from the OS. Throws if the plugin cannot be reached.
const refreshPermission = async (): Promise<NotificationPermissionState> => {
  permission.value = await getNotificationPermissionState();
  return permission.value;
};

/// For an explicit user action (the switch, or the 去授权 link): makes sure notifications are
/// allowed, asking the OS if they are not. Always asks when the permission is missing -- the
/// "already asked" memory only applies to the automatic prompt at startup.
const ensurePermission = async (): Promise<boolean> => {
  if ((await refreshPermission()) === "granted") return true;
  markPermissionAsked();
  permission.value = await requestNotificationPermissionState();
  return permission.value === "granted";
};

interface PlannedReminder {
  id: number;
  triggerAt: number;
  title: string;
  body: string;
}

/// Everything that needs the timetable lives in here, created once and kept for the life of the
/// app. It cannot be built per `useReminder()` call: useCourses() makes its computed values inside
/// whichever component is calling, and those stop updating when that component unmounts -- fine
/// for a view, wrong for a timer that fires long after HomeView has been left for the settings
/// page. Running it in a detached effect scope keeps them alive.
function createEngine() {
  const {
    courses,
    schedules,
    periodConfig,
    semesterStartDate,
    semesterWeekCount,
    weekNumberForDate,
    getSchedulesForWeek,
    getPeriodStartMinutes
  } = useCourses();

  watch(prefs, () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs.value));
  }, { deep: true });

  const cancelAll = async (ids: number[]) => {
    for (const id of ids) {
      try {
        await cancelReminder(id);
      } catch {
        // Best effort: a stale reminder the platform refuses to drop is not worth failing over.
      }
    }
  };

  /// Registers one reminder per class meeting in the next WINDOW_DAYS, and cancels the ones that
  /// no longer qualify. Returns what it did, including the first error encountered: a rejection
  /// was previously discarded per schedule, which made a systematic failure -- a command that does
  /// not resolve, a capability that is not granted -- indistinguishable from "nothing to schedule".
  const rescheduleNow = async (): Promise<RescheduleResult> => {
    const previously = readRegistered();

    if (!prefs.value.enabled) {
      await cancelAll(previously);
      writeRegistered([]);
      return { scheduled: 0, cancelled: previously.length };
    }

    // Without the permission the OS discards the reminders (Android 13+ drops the notification
    // when the alarm fires, iOS refuses the request), so there is no point registering them. The
    // switch stays as the user left it: the preference is what they want, the permission is only
    // whether it can happen right now, and the settings page shows the difference.
    let granted: NotificationPermissionState;
    try {
      granted = await refreshPermission();
      if (granted !== "granted" && !wasPermissionAsked()) {
        markPermissionAsked();
        permission.value = granted = await requestNotificationPermissionState();
      }
    } catch (e) {
      // Not being able to read the permission says nothing about what is already registered, so
      // leave it alone rather than cancelling everything.
      return { scheduled: 0, cancelled: 0, error: describeError(e) };
    }
    if (granted !== "granted") {
      await cancelAll(previously);
      writeRegistered([]);
      return { scheduled: 0, cancelled: previously.length, noPermission: true };
    }

    const now = Date.now();
    const minutesBefore = prefs.value.minutesBefore;
    const today = startOfDay(new Date());
    const planned = new Map<number, PlannedReminder>();

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
          minutesBefore * 60000;
        // Already past -- e.g. a class earlier today. AlarmManager would fire it immediately, and
        // iOS rejects a trigger that is not in the future.
        if (triggerAt <= now) continue;

        const course = courses.value.find((item) => item.id === schedule.courseId);
        const title = course?.name ? `即将上课：${course.name}` : "即将上课";
        const body = [
          `${minutesBefore} 分钟后`,
          `${clock(startMinutes)} 开始`,
          `第 ${schedule.startPeriod}-${schedule.endPeriod} 节`,
          // 这一次课的教室优先：提醒说的是"这一节"，而同一门课换教室是常态。
          schedule.location || course?.location || ""
        ].filter(Boolean).join(" · ");

        planned.set(schedule.id, { id: schedule.id, triggerAt, title, body });
      }
    }

    const selected = [...planned.values()]
      .sort((a, b) => a.triggerAt - b.triggerAt || a.id - b.id)
      .slice(0, MAX_REMINDERS);
    const selectedIds = new Set(selected.map((item) => item.id));

    // Dropped before the new ones go in, not after: with the platform cap in play, adding first
    // could push the total over it and make iOS discard some of the reminders being added.
    const stale = previously.filter((id) => !selectedIds.has(id));
    await cancelAll(stale);

    const scheduled: number[] = [];
    const failed: number[] = [];
    let firstError = "";
    for (const item of selected) {
      try {
        await setReminder(item.id, item.triggerAt, item.title, item.body);
        scheduled.push(item.id);
      } catch (e) {
        failed.push(item.id);
        // Keep the first failure rather than dropping it; the caller shows it verbatim.
        // 用 describeError 而不是 `(e as Error).message`：Tauri 拒绝 Promise 时给的是错误值
        // 本身（对 Err(String) 就是字符串），取 .message 会得到 undefined，把真实原因吞掉。
        if (!firstError) {
          firstError = describeError(e);
        }
      }
    }

    // A failed id that was registered before still has its old reminder on the platform, so it
    // stays on the list for a later run to cancel or replace.
    writeRegistered([...scheduled, ...failed.filter((id) => previously.includes(id))]);

    return { scheduled: scheduled.length, cancelled: stale.length, error: firstError || undefined };
  };

  // Runs are chained rather than overlapped. The refresh timer, the settings switch and the
  // stepper can all ask at once, and two runs interleaving would each read the same "registered"
  // list and then overwrite each other's record of what the platform holds.
  let queue: Promise<unknown> = Promise.resolve();
  const reschedule = (): Promise<RescheduleResult> => {
    const run = queue.then(rescheduleNow);
    queue = run.catch(() => undefined);
    return run;
  };

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  /// Debounced reschedule for callers that do not care about the result. Failures are swallowed
  /// deliberately: not being able to schedule a reminder must never get in the way of using the
  /// timetable.
  const refresh = () => {
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      reschedule().catch(() => {});
    }, REFRESH_DELAY_MS);
  };

  // Everything rescheduling reads from the timetable: what the classes are (courses, schedules),
  // when a period starts (periodConfig) and which week a date falls in (semesterStartDate). Deep,
  // because edits mutate these in place as often as they replace them. The reminder preferences
  // are not watched here; the settings page applies those itself and shows the outcome.
  watch([courses, schedules, periodConfig, semesterStartDate], refresh, { deep: true });

  // The seven-day window only moves when something reschedules. An app that stays open in the
  // background for days would otherwise run out of reminders, and a permission granted in the
  // system settings would not be noticed until the next cold start.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });

  return { reschedule, refresh };
}

let engine: ReturnType<typeof createEngine> | null = null;

const getEngine = (): ReturnType<typeof createEngine> => {
  if (!engine) {
    // `true` detaches the scope from the calling component, so the watchers and computed values
    // inside outlive it. Created lazily on the first call rather than at import time, so the
    // module can be imported before anything has asked for reminders.
    engine = effectScope(true).run(createEngine)!;
  }
  return engine;
};

export function useReminder() {
  const { reschedule, refresh } = getEngine();

  return {
    prefs,
    permission,
    maxMinutesBefore: MAX_MINUTES_BEFORE,
    reschedule,
    /// Debounced, fire-and-forget version of reschedule.
    refreshReminders: refresh,
    refreshPermission,
    ensurePermission
  };
}
