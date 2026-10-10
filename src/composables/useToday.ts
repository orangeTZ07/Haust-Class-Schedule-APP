import { computed, ref } from "vue";
import { useCourses } from "./useCourses";

/// What "today" and "this week" are right now, as reactive values.
///
/// They have to be reactive and not a one-off `new Date()`: the app is routinely left open overnight
/// or backgrounded for days, and a highlight computed once at startup would keep marking yesterday.
/// The clock is re-read at midnight, whenever the app comes back to the foreground, and -- while the
/// app is on screen -- once a minute. The minute matters because the timetable dims a class the
/// moment it is over (classOver.ts), which happens in the middle of a day, not at midnight.
const now = ref(new Date());
let midnightTimer: ReturnType<typeof setTimeout> | null = null;

const refresh = () => {
  now.value = new Date();
  scheduleMidnightRefresh();
};

function scheduleMidnightRefresh() {
  if (midnightTimer !== null) clearTimeout(midnightTimer);
  const current = new Date();
  // A second past midnight, so the next tick cannot land on the previous day.
  const nextMidnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 1);
  midnightTimer = setTimeout(refresh, nextMidnight.getTime() - current.getTime());
}

/// 前台每分钟重读一次。不做得更密：一分钟的偏差在一节 45 分钟的课面前看不出来，
/// 而每分钟都会让课表重算一遍「哪些课上过了」。
///
/// 只在可见时走 —— 后台什么也不做（浏览器本来也会把定时器压到一分钟以上），
/// 回到前台时下面的 visibilitychange 会立刻补上一次，不需要靠定时器赶上。
const LIVE_TICK_MS = 60000;
let tickTimer: ReturnType<typeof setInterval> | null = null;

const startLiveTick = () => {
  if (tickTimer !== null) return;
  tickTimer = setInterval(() => {
    now.value = new Date();
  }, LIVE_TICK_MS);
};

const stopLiveTick = () => {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
};

if (typeof document !== "undefined") {
  scheduleMidnightRefresh();
  if (!document.hidden) startLiveTick();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLiveTick();
      return;
    }
    refresh();
    startLiveTick();
  });
}

export function useToday() {
  const { weekNumberForDate } = useCourses();

  /// 1 (Monday) to 7 (Sunday).
  const todayDayNumber = computed(() => {
    const day = now.value.getDay();
    return day === 0 ? 7 : day;
  });

  /// The semester week today falls in, counted from the semester start date, or null when that is
  /// unusable (no start date, or today is before it). This is what the "本周" markers compare the
  /// week on screen against; `currentWeek` is only the week being viewed.
  const actualWeek = computed(() => weekNumberForDate(now.value));

  /// 同一只时钟也对外：课表判「这节课上过没有」用的就是它，而不是自己再取一次 new Date() ——
  /// 两只时钟会各自漂，而漂出来的差别没人能一眼看出是 bug。
  return { now, todayDayNumber, actualWeek };
}
