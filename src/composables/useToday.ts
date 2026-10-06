import { computed, ref } from "vue";
import { useCourses } from "./useCourses";

/// What "today" and "this week" are right now, as reactive values.
///
/// They have to be reactive and not a one-off `new Date()`: the app is routinely left open overnight
/// or backgrounded for days, and a highlight computed once at startup would keep marking yesterday.
/// The clock is re-read at midnight and whenever the app comes back to the foreground.
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

if (typeof document !== "undefined") {
  scheduleMidnightRefresh();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
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

  return { todayDayNumber, actualWeek };
}
