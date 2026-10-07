import { ref, computed, watch } from "vue";
import type { Course, CourseSchedule, CourseImportItem, CourseTable, PeriodTimeConfig } from "@/types/course";
import { parseCSV, parseSemesterCSV, type ParsedCourse } from "@/utils/csvImporter";
import {
  canRedo,
  canUndo,
  cloneSnapshot,
  pushSnapshot,
  redoStep,
  seedHistory,
  sessionChangeCount,
  undoStep,
  type TableHistory,
  type TimetableSnapshot
} from "@/utils/editHistory";
import {
  cancelDraftForWeek,
  idsForSemesterDelete,
  needsWeeklyCancel,
  weeklyRowToDelete,
  weeksForDeleteScope,
  type DeleteScopePayload
} from "@/utils/scheduleDelete";
import {
  createDefaultPeriodConfig,
  formatPeriodRange,
  isValidPeriodConfig,
  parseStoredPeriodConfig,
  periodRange,
  resizeSection,
  sectionOfPeriod,
  type PeriodSection
} from "@/utils/periodSchedule";
import * as courseService from "@/services/courseService";

const COLORS = [
  "#1989fa", "#07c160", "#ff976a", "#ee0a24", "#7232dd",
  "#ffcd00", "#14c4c4", "#f97316", "#8b5cf6", "#ec4899",
  "#10b981", "#6366f1"
];

const courses = ref<Course[]>([]);
const schedules = ref<CourseSchedule[]>([]);
const courseTables = ref<CourseTable[]>([]);
const activeCourseTableId = ref<number>(1);
const periodConfig = ref<PeriodTimeConfig>(createDefaultPeriodConfig());
const currentWeek = ref(1);
/// Monday of week 1, as "YYYY-MM-DD". 2026-08-31 is the start of this institution's
/// 2026-2027 first semester -- it is what makes week 4 read 09-21..09-27 -- and it is only a
/// starting point: 设置 -> 网格设置 lets it be changed, and the value is persisted.
const DEFAULT_SEMESTER_START = "2026-08-31";
const semesterStartDate = ref(DEFAULT_SEMESTER_START);

/// Edit mode is entered by a timetable gesture, not by a separate button. The bar stays up
/// until the user finishes it. History itself is per course table; this flag is only the chrome.
const editing = ref(false);
/// History index of the timetable on screen when this edit session started.
/// The bar's number is current index minus this, not a counter that steps itself.
const sessionEntryIndex = ref(0);
const tableHistory = ref<TableHistory>({ snapshots: [], index: 0 });
const sessionCount = computed(() => sessionChangeCount(tableHistory.value.index, sessionEntryIndex.value));
let historyTableId = 0;
let applyingHistory = false;
let historyWrite: Promise<void> = Promise.resolve();

let nextCourseId = 1;
let nextScheduleId = 1;

const STORAGE_KEYS = {
  PERIOD_CONFIG: "course-mngr-period-config",
  CURRENT_WEEK: "course-mngr-current-week",
  SEMESTER_START: "course-mngr-semester-start"
};

/// Keys that older versions wrote and nothing reads any more, removed once at startup so they do not
/// sit in storage forever.
///   - the learning-plan preference went with that feature;
///   - the import snapshot went with 恢复到导入时 (importing now creates a new course table instead).
///     It held a whole backup JSON of the timetable, so it was the one worth reclaiming;
///   - the browser-only todo list went with the 待办 feature. Only this localStorage copy is dropped:
///     the `todos` table in the phone's SQLite is deliberately left alone so the data survives if the
///     feature ever comes back.
const LEGACY_STORAGE_KEYS = [
  "course-mngr-learning-plan-preference",
  "course-mngr-import-snapshot",
  "web-fallback-todos"
];
try {
  for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
} catch {
  // Storage unavailable; there is nothing stored to clean up either.
}

/// Parses "YYYY-MM-DD" as local midnight. Built from the parts rather than Date.parse
/// because the bare date string is read as UTC midnight and would land a day early in every
/// timezone behind UTC -- which would show the wrong date to exactly the users who set it.
const parseIsoDate = (iso: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const getScheduleScope = (schedule: CourseSchedule) => schedule.scope ?? "semester";

const isScheduleActiveInWeek = (schedule: CourseSchedule, week: number) => {
  if (week < schedule.startWeek || week > schedule.endWeek) {
    return false;
  }

  if (schedule.weekType === "odd") {
    return week % 2 === 1;
  }

  if (schedule.weekType === "even") {
    return week % 2 === 0;
  }

  return true;
};

const schedulesOverlap = (first: CourseSchedule, second: CourseSchedule) => {
  return first.dayOfWeek === second.dayOfWeek &&
    first.startPeriod <= second.endPeriod &&
    second.startPeriod <= first.endPeriod;
};

// Persistence Logic
async function loadDataFromDb() {
  try {
    courseTables.value = await courseService.getCourseTables();
    activeCourseTableId.value = await courseService.getActiveCourseTableId();
    const dbCourses = await courseService.getAllCourses();
    const dbSchedules = await courseService.getAllSchedules();
    
    courses.value = dbCourses;
    schedules.value = dbSchedules;
    
    if (courses.value.length > 0) {
      nextCourseId = Math.max(...courses.value.map(c => c.id)) + 1;
    }
    if (schedules.value.length > 0) {
      nextScheduleId = Math.max(...schedules.value.map(s => s.id)) + 1;
    }

    // Old-format and unreadable values are converted here and written back by the watcher in
    // useCourses(); parseStoredPeriodConfig documents what each case keeps.
    periodConfig.value = parseStoredPeriodConfig(localStorage.getItem(STORAGE_KEYS.PERIOD_CONFIG)).config;

    const savedCurrentWeek = Number(localStorage.getItem(STORAGE_KEYS.CURRENT_WEEK));
    if (Number.isFinite(savedCurrentWeek) && savedCurrentWeek > 0) {
      currentWeek.value = savedCurrentWeek;
    }

    const savedSemesterStart = localStorage.getItem(STORAGE_KEYS.SEMESTER_START);
    if (savedSemesterStart) {
      semesterStartDate.value = savedSemesterStart;
    }
    await adoptEditHistory();
  } catch (e) {
    console.error("Failed to load data from SQLite", e);
  }
}

/// Which semester week a date falls in, or null when the semester start is missing or the date
/// precedes it.
///
/// Counted in whole local days rather than by dividing timestamps: across a daylight-saving
/// change a calendar day is not 24 hours, so a raw millisecond division lands on the wrong week
/// for part of the year. Rounding after subtracting two local midnights absorbs that hour.
const weekNumberForDate = (date: Date): number | null => {
  const start = parseIsoDate(semesterStartDate.value);
  if (!start) return null;

  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const to = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((to.getTime() - from.getTime()) / 86400000);
  if (days < 0) return null;

  return Math.floor(days / 7) + 1;
};

const semesterWeekCount = computed(() => {
  const maxImportedWeek = schedules.value.reduce((max, schedule) => Math.max(max, schedule.endWeek), 0);
  return Math.max(maxImportedWeek, 20);
});

/// The week a table should open on: this week by the calendar, or week 1 when the calendar has
/// nothing useful to say (no semester start, today is before it, or the semester is already over).
/// semesterStartDate is one app-wide setting rather than a per-table one, so the same date applies
/// to whichever table is opened. Call it after the table's schedules are loaded: semesterWeekCount
/// grows with the weeks they use.
const weekToOpenOn = (): number => {
  const week = weekNumberForDate(new Date());
  return week !== null && week >= 1 && week <= semesterWeekCount.value ? week : 1;
};

const persistEditHistory = () => {
  const tableId = activeCourseTableId.value;
  const history = tableHistory.value;
  historyWrite = historyWrite.then(() => courseService.writeEditHistory(tableId, history)).catch(error => {
    console.error("Failed to store edit history", error);
  });
};

/// Load this table's stored snapshots. Same table reloads (a delete that re-reads the db)
/// keep the in-memory session, so the following commit still belongs to the edit in progress.
const adoptEditHistory = async () => {
  if (applyingHistory) return;
  const tableId = activeCourseTableId.value;
  if (tableId === historyTableId && tableHistory.value.snapshots.length > 0) return;
  historyTableId = tableId;
  const stored = await courseService.readEditHistory(tableId);
  if (!stored) {
    tableHistory.value = seedHistory(cloneSnapshot(courses.value, schedules.value));
    persistEditHistory();
  } else {
    tableHistory.value = stored;
  }
  editing.value = false;
  sessionEntryIndex.value = tableHistory.value.index;
};

/// Import, re-import and clear replace the timetable outright. The chain becomes only the
/// finished timetable, so undo cannot step into a half-written import or back out of it.
const anchorEditHistory = () => {
  if (applyingHistory) return;
  historyTableId = activeCourseTableId.value;
  tableHistory.value = seedHistory(cloneSnapshot(courses.value, schedules.value));
  sessionEntryIndex.value = 0;
  editing.value = false;
  persistEditHistory();
};

/// A course table created for importAsNewCourseTable has no action groups until the import
/// finishes and anchorEditHistory stores that one finished snapshot.
const beginEmptyEditHistory = () => {
  historyTableId = activeCourseTableId.value;
  tableHistory.value = { snapshots: [], index: 0 };
  sessionEntryIndex.value = 0;
  editing.value = false;
  historyWrite = historyWrite.then(() => courseService.forgetEditHistory(historyTableId)).catch(error => {
    console.error("Failed to clear edit history", error);
  });
};

const restoreTimetable = async (snapshot: TimetableSnapshot) => {
  applyingHistory = true;
  try {
    await courseService.replaceActiveTableContents(snapshot.courses, snapshot.schedules);
    courses.value = snapshot.courses.map(course => ({ ...course }));
    schedules.value = snapshot.schedules.map(schedule => ({ ...schedule }));
    nextCourseId = courses.value.length > 0 ? Math.max(...courses.value.map(course => course.id)) + 1 : 1;
    nextScheduleId = schedules.value.length > 0 ? Math.max(...schedules.value.map(schedule => schedule.id)) + 1 : 1;
  } finally {
    applyingHistory = false;
  }
};

const commitEdit = () => {
  if (applyingHistory) return;
  const next = cloneSnapshot(courses.value, schedules.value);
  const entry = editing.value ? sessionEntryIndex.value : tableHistory.value.index;
  const pushed = pushSnapshot(tableHistory.value, next, entry);
  if (!pushed.changed) return;
  tableHistory.value = pushed.history;
  sessionEntryIndex.value = pushed.sessionEntryIndex;
  editing.value = true;
  persistEditHistory();
};

const canUndoEdit = computed(() => canUndo(tableHistory.value));
const canRedoEdit = computed(() => canRedo(tableHistory.value));

const applyHistoryIndex = async (next: TableHistory) => {
  const snapshot = next.snapshots[next.index];
  if (!snapshot) return;
  applyingHistory = true;
  try {
    await courseService.replaceActiveTableContents(snapshot.courses, snapshot.schedules);
    courses.value = snapshot.courses.map(course => ({ ...course }));
    schedules.value = snapshot.schedules.map(schedule => ({ ...schedule }));
    tableHistory.value = next;
    if (courses.value.length > 0) nextCourseId = Math.max(...courses.value.map(course => course.id)) + 1;
    if (schedules.value.length > 0) nextScheduleId = Math.max(...schedules.value.map(schedule => schedule.id)) + 1;
    persistEditHistory();
  } finally {
    applyingHistory = false;
  }
};

const undoEdit = async () => {
  const next = undoStep(tableHistory.value);
  if (!next) return;
  await applyHistoryIndex(next);
};

const redoEdit = async () => {
  const next = redoStep(tableHistory.value);
  if (!next) return;
  await applyHistoryIndex(next);
};

const exitEditMode = () => {
  editing.value = false;
};

// Initial load. A cold start opens on this week by the calendar instead of the week saved from
// the last session: by the time the app is reopened that week can be days or months stale, while
// the today column, the 本周 marks and the class reminders all go by the calendar. Outside the
// semester the calendar has no week to offer, and then the saved week is kept rather than forcing
// week 1 the way weekToOpenOn does for a freshly opened table.
const coursesReady: Promise<void> = loadDataFromDb().then(() => {
  const week = weekNumberForDate(new Date());
  if (week !== null && week <= semesterWeekCount.value) {
    currentWeek.value = week;
  }
});

export function useCourses() {
  // Watch for config changes and save to localStorage (config remains in localStorage for simplicity)
  watch(periodConfig, () => {
    localStorage.setItem(STORAGE_KEYS.PERIOD_CONFIG, JSON.stringify(periodConfig.value));
  }, { deep: true });

  watch(currentWeek, () => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_WEEK, String(currentWeek.value));
  });

  watch(semesterStartDate, () => {
    localStorage.setItem(STORAGE_KEYS.SEMESTER_START, semesterStartDate.value);
  });

  /// "MM-DD" for each of the seven columns of the week on screen, Monday first, or nulls when
  /// the semester start is unusable. Computed from the week number rather than stored, so the
  /// dates follow the week selector instead of having to be kept in sync with it.
  const weekDateLabels = computed<(string | null)[]>(() => {
    const start = parseIsoDate(semesterStartDate.value);
    return Array.from({ length: 7 }, (_, index) => {
      if (!start) return null;
      const date = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + (currentWeek.value - 1) * 7 + index
      );
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${month}-${day}`;
    });
  });

  const setSemesterStartDate = (iso: string) => {
    semesterStartDate.value = iso;
  };

  const semesterSchedules = computed(() => {
    return schedules.value.filter(schedule => getScheduleScope(schedule) === "semester");
  });

  /// The schedules that actually apply in a given week, with weekly overrides suppressing the
  /// semester entries they replace. effectiveSchedules is this for the displayed week, but the
  /// reminder scheduler needs arbitrary weeks: a seven-day window starting today does not line up
  /// with whichever week happens to be on screen.
  const getSchedulesForWeek = (week: number): CourseSchedule[] => {
    const baseSchedules = semesterSchedules.value.filter(schedule => isScheduleActiveInWeek(schedule, week));
    const weeklySchedules = schedules.value.filter(schedule => {
      return getScheduleScope(schedule) === "weekly" && isScheduleActiveInWeek(schedule, week);
    });

    const suppressedBaseIds = new Set(
      baseSchedules
        .filter(baseSchedule => weeklySchedules.some(weeklySchedule => schedulesOverlap(baseSchedule, weeklySchedule)))
        .map(schedule => schedule.id)
    );

    return [
      ...baseSchedules.filter(schedule => !suppressedBaseIds.has(schedule.id)),
      ...weeklySchedules.filter(schedule => !schedule.isCancelled)
    ].sort((a, b) => {
      return a.dayOfWeek - b.dayOfWeek ||
        a.startPeriod - b.startPeriod ||
        a.endPeriod - b.endPeriod ||
        a.id - b.id;
    });
  };

  const effectiveSchedules = computed(() => getSchedulesForWeek(currentWeek.value));

  const activeCourseTable = computed(() => {
    return courseTables.value.find(table => table.id === activeCourseTableId.value) || courseTables.value[0] || null;
  });

  const setCurrentWeek = (week: number) => {
    currentWeek.value = Math.min(Math.max(Math.round(week), 1), semesterWeekCount.value);
  };

  const shiftCurrentWeek = (offset: number) => {
    setCurrentWeek(currentWeek.value + offset);
  };

  /// Minutes past midnight at which a period begins, or null when the period is outside the
  /// current period configuration. Split out from getPeriodTime so the reminder scheduler can
  /// place an alarm at a real clock time without parsing the "08:00-08:45" display string.
  const getPeriodStartMinutes = (period: number): number | null => {
    return periodRange(periodConfig.value, period)?.start ?? null;
  };

  const getPeriodTime = (period: number): string => {
    const range = periodRange(periodConfig.value, period);
    return range ? formatPeriodRange(range) : "";
  };

  const periodSlots = computed(() => {
    const config = periodConfig.value;
    return config.periods.map((_, index) => {
      const period = index + 1;
      return {
        period,
        time: getPeriodTime(period),
        section: (sectionOfPeriod(config, period)?.section ?? "evening") as PeriodSection
      };
    });
  });

  /// The one way to replace the clock from outside: a bad config (hand-edited storage, a bug in a
  /// caller) is refused instead of reaching the grid and the reminder scheduler.
  const setPeriodConfig = (next: PeriodTimeConfig): boolean => {
    if (!isValidPeriodConfig(next)) return false;
    periodConfig.value = next;
    return true;
  };

  const resetPeriodConfig = () => {
    periodConfig.value = createDefaultPeriodConfig();
  };

  /// 上午 / 下午 / 晚上 的节数。放不下（会超过 24:00）时返回 false，什么都不改。
  const setSectionPeriodCount = (section: PeriodSection, count: number): boolean => {
    const next = resizeSection(periodConfig.value, section, count);
    return next ? setPeriodConfig(next) : false;
  };

  const getCourseById = (id: number) => courses.value.find(c => c.id === id);

  const getDaySchedules = (day: number) => {
    return effectiveSchedules.value
      .filter(s => s.dayOfWeek === day)
      .sort((a, b) => a.startPeriod - b.startPeriod);
  };

  const getCellCourses = (day: number, period: number) => {
    const result: Array<{ course: Course; schedule: CourseSchedule }> = [];
    for (const schedule of effectiveSchedules.value) {
      if (schedule.dayOfWeek === day && schedule.startPeriod === period) {
        const course = getCourseById(schedule.courseId);
        if (course) {
          result.push({ course, schedule });
        }
      }
    }
    return result;
  };

  // color is optional and only supplied when restoring a backup, so that a course comes back
  // the colour it was. Every other caller still gets the next palette entry.
  const addCourse = async (name: string, teacher?: string, location?: string, color?: string): Promise<Course> => {
    const colorIndex = courses.value.length % COLORS.length;
    const courseData = {
      name,
      teacher,
      location,
      color: color || COLORS[colorIndex]
    };
    
    const id = await courseService.addCourse(courseData);
    const course = { id, ...courseData };
    courses.value.push(course);
    return course;
  };

  const addSchedule = async (
    courseId: number,
    dayOfWeek: number,
    startPeriod: number,
    endPeriod: number,
    options: Partial<Pick<CourseSchedule, "startWeek" | "endWeek" | "weekType" | "scope" | "isCancelled" | "source" | "parserVersion">> = {}
  ): Promise<CourseSchedule> => {
    const scheduleData = {
      courseId,
      dayOfWeek,
      startPeriod,
      endPeriod,
      startWeek: options.startWeek ?? 1,
      endWeek: options.endWeek ?? 20,
      weekType: options.weekType ?? ("all" as const),
      scope: options.scope ?? ("semester" as const),
      isCancelled: options.isCancelled ?? false,
      // Only when the caller actually has them. Defaulting these would stamp hand-entered
      // segments as if a parser wrote them.
      ...(options.source ? { source: options.source } : {}),
      ...(typeof options.parserVersion === "number" ? { parserVersion: options.parserVersion } : {})
    };
    
    const id = await courseService.addSchedule(scheduleData);
    const schedule = { id, ...scheduleData };
    schedules.value.push(schedule);
    return schedule;
  };

  const moveSchedule = async (id: number, dayOfWeek: number, startPeriod: number): Promise<CourseSchedule | null> => {
    const current = schedules.value.find(s => s.id === id);
    if (!current) return null;

    const span = current.endPeriod - current.startPeriod;
    if (getScheduleScope(current) === "semester" && isScheduleActiveInWeek(current, currentWeek.value)) {
      await addSchedule(current.courseId, current.dayOfWeek, current.startPeriod, current.endPeriod, {
        startWeek: currentWeek.value,
        endWeek: currentWeek.value,
        weekType: "all",
        scope: "weekly",
        isCancelled: true
      });

      return await addSchedule(current.courseId, dayOfWeek, startPeriod, startPeriod + span, {
        startWeek: currentWeek.value,
        endWeek: currentWeek.value,
        weekType: "all",
        scope: "weekly",
        isCancelled: false
      });
    }

    const updated: CourseSchedule = {
      ...current,
      dayOfWeek,
      startPeriod,
      endPeriod: startPeriod + span
    };

    await courseService.updateSchedule(updated);
    const index = schedules.value.findIndex(s => s.id === id);
    if (index !== -1) {
      schedules.value[index] = updated;
    }
    return updated;
  };

  const updateCourseFields = async (
    id: number,
    fields: Pick<Course, "name" | "teacher" | "location">
  ): Promise<Course | null> => {
    const current = getCourseById(id);
    if (!current) return null;
    const updated: Course = {
      ...current,
      name: fields.name,
      teacher: fields.teacher,
      location: fields.location
    };
    await courseService.updateCourse(updated);
    const index = courses.value.findIndex(course => course.id === id);
    if (index !== -1) courses.value[index] = updated;
    return updated;
  };

  const patchSchedule = async (updated: CourseSchedule): Promise<void> => {
    await courseService.updateSchedule(updated);
    const index = schedules.value.findIndex(item => item.id === updated.id);
    if (index !== -1) schedules.value[index] = updated;
  };

  /// Gear-drop edit: one user save is one undo group. Week scope matches delete.
  const updateOccurrenceInScope = async (
    id: number,
    payload: DeleteScopePayload & {
      name: string;
      teacher?: string;
      location?: string;
      span: number;
    }
  ): Promise<boolean> => {
    const current = schedules.value.find(item => item.id === id);
    if (!current) return false;
    const course = getCourseById(current.courseId);
    if (!course) return false;

    const span = Math.max(1, payload.span);
    const endPeriod = current.startPeriod + span - 1;
    const name = payload.name.trim();
    if (!name) return false;
    const teacher = payload.teacher?.trim() || undefined;
    const location = payload.location?.trim() || undefined;
    const fieldsChanged =
      course.name !== name ||
      (course.teacher || "") !== (teacher || "") ||
      (course.location || "") !== (location || "");
    const spanChanged = current.endPeriod !== endPeriod;
    const weeks = weeksForDeleteScope(payload, currentWeek.value);

    if (weeks === "all") {
      if (fieldsChanged) await updateCourseFields(course.id, { name, teacher, location });
      if (!spanChanged && !fieldsChanged) return false;
      if (spanChanged) {
        const ids = idsForSemesterDelete(schedules.value, current);
        for (const scheduleId of ids) {
          const row = schedules.value.find(item => item.id === scheduleId);
          if (!row || row.isCancelled) continue;
          const nextEnd = row.startPeriod + span - 1;
          if (row.endPeriod === nextEnd) continue;
          await patchSchedule({ ...row, endPeriod: nextEnd });
        }
      }
      return true;
    }

    let overlayCourseId = current.courseId;
    if (fieldsChanged) {
      const created = await addCourse(name, teacher, location, course.color);
      overlayCourseId = created.id;
    }

    let changed = false;
    const snapshot = [...schedules.value];
    for (const week of weeks) {
      const weekly = weeklyRowToDelete(snapshot, current, week);
      if (weekly) {
        await patchSchedule({
          ...weekly,
          courseId: overlayCourseId,
          endPeriod: weekly.startPeriod + span - 1
        });
        changed = true;
        continue;
      }
      if (needsWeeklyCancel(schedules.value, current, week)) {
        const draft = cancelDraftForWeek(current, week);
        await addSchedule(draft.courseId, draft.dayOfWeek, draft.startPeriod, draft.endPeriod, {
          startWeek: draft.week,
          endWeek: draft.week,
          weekType: "all",
          scope: "weekly",
          isCancelled: true
        });
        changed = true;
      }
      if (isScheduleActiveInWeek(current, week) || weekly) {
        await addSchedule(overlayCourseId, current.dayOfWeek, current.startPeriod, endPeriod, {
          startWeek: week,
          endWeek: week,
          weekType: "all",
          scope: "weekly",
          isCancelled: false
        });
        changed = true;
      }
    }
    return changed;
  };

  const removeSchedule = async (id: number): Promise<boolean> => {
    return removeScheduleInScope(id, { weekScope: "current" });
  };

  const removeScheduleInScope = async (id: number, payload: DeleteScopePayload): Promise<boolean> => {
    const current = schedules.value.find(s => s.id === id);
    if (!current) return false;

    const weeks = weeksForDeleteScope(payload, currentWeek.value);
    if (weeks === "all") {
      const ids = idsForSemesterDelete(schedules.value, current);
      if (ids.length === 0) return false;
      for (const scheduleId of ids) {
        await courseService.deleteSchedule(scheduleId);
      }
      const drop = new Set(ids);
      schedules.value = schedules.value.filter(schedule => !drop.has(schedule.id));
      return true;
    }

    let changed = false;
    const snapshot = [...schedules.value];
    for (const week of weeks) {
      const weekly = weeklyRowToDelete(snapshot, current, week);
      if (weekly) {
        await courseService.deleteSchedule(weekly.id);
        schedules.value = schedules.value.filter(schedule => schedule.id !== weekly.id);
        changed = true;
        continue;
      }
      if (needsWeeklyCancel(schedules.value, current, week)) {
        const draft = cancelDraftForWeek(current, week);
        await addSchedule(draft.courseId, draft.dayOfWeek, draft.startPeriod, draft.endPeriod, {
          startWeek: draft.week,
          endWeek: draft.week,
          weekType: "all",
          scope: "weekly",
          isCancelled: true
        });
        changed = true;
      }
    }
    return changed;
  };

  const clearAll = async (options?: { boundary?: boolean }) => {
    await courseService.clearAllData();
    courses.value = [];
    schedules.value = [];
    nextCourseId = 1;
    nextScheduleId = 1;
    if (options?.boundary !== false) anchorEditHistory();
  };

  const switchCourseTable = async (id: number) => {
    await courseService.setActiveCourseTableId(id);
    activeCourseTableId.value = id;
    // loadDataFromDb restores the last viewed week from storage, so the week is set after it.
    await loadDataFromDb();
    currentWeek.value = weekToOpenOn();
  };

  const createCourseTable = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const id = await courseService.addCourseTable(trimmed);
    await courseService.setActiveCourseTableId(id);
    activeCourseTableId.value = id;
    await loadDataFromDb();
    currentWeek.value = weekToOpenOn();
    return id;
  };

  const renameCourseTable = async (id: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    await courseService.renameCourseTable(id, trimmed);
    await loadDataFromDb();
  };

  const deleteCourseTable = async (id: number) => {
    if (id === historyTableId) historyTableId = 0;
    await courseService.deleteCourseTable(id);
    await loadDataFromDb();
  };

  const removeCourse = async (id: number) => {
    await courseService.deleteCourse(id);
    courses.value = courses.value.filter(c => c.id !== id);
    schedules.value = schedules.value.filter(s => s.courseId !== id);
    await loadDataFromDb();
  };

  const createImportedSchedule = async (
    item: ParsedCourse,
    options: Partial<Pick<CourseSchedule, "startWeek" | "endWeek" | "weekType" | "scope" | "isCancelled">> = {}
  ) => {
    const course = await addCourse(item.name, undefined, item.location);
    return await addSchedule(course.id, item.day, item.startPeriod, item.endPeriod, {
      startWeek: options.startWeek,
      endWeek: options.endWeek,
      weekType: options.weekType,
      scope: options.scope,
      isCancelled: options.isCancelled
    });
  };

  const writeWeeklyCancellationLayer = async (week: number) => {
    const baseSchedules = semesterSchedules.value.filter(schedule => isScheduleActiveInWeek(schedule, week));
    for (const schedule of baseSchedules) {
      await addSchedule(schedule.courseId, schedule.dayOfWeek, schedule.startPeriod, schedule.endPeriod, {
        startWeek: week,
        endWeek: week,
        weekType: "all",
        scope: "weekly",
        isCancelled: true
      });
    }
  };

  const escapeCsvValue = (value: string) => {
    if (!value) return "";
    if (value.includes(",") || value.includes("\n") || value.includes("\"")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const dayMap: Record<number, string> = {
    1: "周一",
    2: "周二",
    3: "周三",
    4: "周四",
    5: "周五",
    6: "周六",
    7: "周日"
  };

  const toCsvRows = (sourceSchedules: CourseSchedule[], includeWeekColumns: boolean) => {
    return [...sourceSchedules].sort((a, b) => {
      return a.dayOfWeek - b.dayOfWeek ||
        a.startPeriod - b.startPeriod ||
        a.endPeriod - b.endPeriod ||
        a.startWeek - b.startWeek ||
        a.endWeek - b.endWeek ||
        a.id - b.id;
    }).map(schedule => {
      const course = getCourseById(schedule.courseId);
      if (!course) return null;

      const common = [
        dayMap[schedule.dayOfWeek],
        String(schedule.startPeriod),
        String(schedule.endPeriod),
        escapeCsvValue(course.name),
        escapeCsvValue(course.location || "")
      ];

      if (!includeWeekColumns) {
        return common.join(",");
      }

      const weekTypeLabel = schedule.weekType === "odd" ? "单" : schedule.weekType === "even" ? "双" : "全部";
      return [...common, String(schedule.startWeek), String(schedule.endWeek), weekTypeLabel].join(",");
    }).filter((row): row is string => Boolean(row));
  };

  const importFromCsv = async (csvStr: string, overwrite: boolean = false): Promise<{ success: boolean; message: string; count: number }> => {
    let before: TimetableSnapshot | null = null;
    try {
      const items = parseCSV(csvStr);
      if (items.length === 0) {
        return { success: false, message: "未识别到有效的 CSV 数据", count: 0 };
      }
      before = cloneSnapshot(courses.value, schedules.value);

      if (overwrite) {
        await courseService.clearWeeklySchedulesForWeek(currentWeek.value);
        schedules.value = schedules.value.filter(schedule => {
          return !(getScheduleScope(schedule) === "weekly" &&
            schedule.startWeek === currentWeek.value &&
            schedule.endWeek === currentWeek.value);
        });
        await writeWeeklyCancellationLayer(currentWeek.value);
      }

      let count = 0;
      for (const item of items) {
        await createImportedSchedule(item, {
          startWeek: currentWeek.value,
          endWeek: currentWeek.value,
          weekType: "all",
          scope: "weekly",
          isCancelled: false
        });
        count++;
      }

      anchorEditHistory();
      return { success: true, message: `成功导入第 ${currentWeek.value} 周的 ${count} 门课程`, count };
    } catch (e) {
      if (before) await restoreTimetable(before);
      return { success: false, message: `导入失败: ${(e as Error).message}`, count: 0 };
    }
  };

  const importFromSemesterCsv = async (csvStr: string, overwrite: boolean = false): Promise<{ success: boolean; message: string; count: number }> => {
    let before: TimetableSnapshot | null = null;
    try {
      const items = parseSemesterCSV(csvStr);
      if (items.length === 0) {
        return { success: false, message: "未识别到有效的学期 CSV 数据", count: 0 };
      }
      before = cloneSnapshot(courses.value, schedules.value);

      if (overwrite) {
        await clearAll({ boundary: false });
      }

      let count = 0;
      for (const item of items) {
        await createImportedSchedule(item, {
          startWeek: item.startWeek,
          endWeek: item.endWeek,
          weekType: item.weekType,
          scope: "semester",
          isCancelled: false
        });
        count++;
      }

      setCurrentWeek(1);
      anchorEditHistory();

      return { success: true, message: `成功导入 ${count} 门课程`, count };
    } catch (e) {
      if (before) await restoreTimetable(before);
      return { success: false, message: `导入失败: ${(e as Error).message}`, count: 0 };
    }
  };

  const importFromJson = async (jsonStr: string): Promise<{ success: boolean; message: string; count: number }> => {
    let before: TimetableSnapshot | null = null;
    try {
      const items: CourseImportItem[] = JSON.parse(jsonStr);
      if (!Array.isArray(items)) {
        return { success: false, message: "JSON 必须是数组格式", count: 0 };
      }
      before = cloneSnapshot(courses.value, schedules.value);

      let count = 0;
      for (const item of items) {
        if (!item.name || !item.day || !item.periods) {
          continue;
        }

        const course = await addCourse(item.name, item.teacher, item.loc);
        const periods = parsePeriods(item.periods);
        if (periods.length > 0) {
          const startPeriod = Math.min(...periods);
          const endPeriod = Math.max(...periods);
          await addSchedule(course.id, item.day, startPeriod, endPeriod);
          count++;
        }
      }

      anchorEditHistory();
      return { success: true, message: `成功导入 ${count} 门课程`, count };
    } catch (e) {
      if (before) await restoreTimetable(before);
      return { success: false, message: `JSON 解析错误: ${(e as Error).message}`, count: 0 };
    }
  };

  /// Restores a 完整 JSON 备份 written by exportToJsonBackup.
  ///
  /// Deliberately not importFromJson: that one parses the flat array of {name, day, periods}
  /// items the AI prompt emits. A backup is an object holding full Course and CourseSchedule
  /// records, including everything the flat shape cannot express -- startWeek, endWeek,
  /// weekType, scope and isCancelled -- which is precisely the per-week override data a user
  /// would be most upset to lose. Feeding a backup to importFromJson fails outright with
  /// "JSON 必须是数组格式", so the export had no way back at all.
  ///
  /// Courses are re-created through addCourse, which allocates fresh ids, so schedules are
  /// re-pointed through a map from the backup's ids to the new ones. Skipping that would
  /// attach each schedule to whichever course happened to share the number.
  ///
  /// Replaces the active table's contents. To keep the current timetable, call this through
  /// importAsNewCourseTable instead.
  const importFromJsonBackup = async (
    jsonStr: string
  ): Promise<{ success: boolean; message: string; count: number; skipped?: number }> => {
    let before: TimetableSnapshot | null = null;
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
          success: false,
          message: "这不是备份：顶层应是含 courses 与 schedules 的对象。如果是一组 AI 生成的课表条目，请用上面的按周 / 按学期导入。",
          count: 0
        };
      }

      const backupCourses: Course[] = Array.isArray(parsed.courses) ? parsed.courses : [];
      const backupSchedules: CourseSchedule[] = Array.isArray(parsed.schedules) ? parsed.schedules : [];
      if (backupCourses.length === 0) {
        return { success: false, message: "备份里没有课程数据", count: 0 };
      }
      before = cloneSnapshot(courses.value, schedules.value);

      // Replace rather than merge: importing a backup should leave the timetable as it was,
      // and merging would leave duplicates behind. A caller that is about to overwrite a
      // timetable with courses in it confirms before we get here.
      // boundary stays off until the restore finishes, so a failure can put the previous
      // timetable back without an undo step that lands in the middle of the import.
      await clearAll({ boundary: false });

      const idMap = new Map<number, number>();
      let courseCount = 0;
      for (const course of backupCourses) {
        const newId = (await addCourse(course.name ?? "未命名课程", course.teacher, course.location, course.color)).id;
        courseCount++;
        // Only courses that carried an id can be remapped. Counting through the map instead of
        // here would report "restored 0 courses" for a backup whose courses have no ids, even
        // though they were created.
        if (typeof course.id === "number") idMap.set(course.id, newId);
      }

      let scheduleCount = 0;
      for (const schedule of backupSchedules) {
        const newCourseId = idMap.get(schedule.courseId);
        if (newCourseId === undefined) continue;
        await addSchedule(newCourseId, schedule.dayOfWeek, schedule.startPeriod, schedule.endPeriod, {
          startWeek: schedule.startWeek,
          endWeek: schedule.endWeek,
          weekType: schedule.weekType,
          scope: schedule.scope,
          isCancelled: schedule.isCancelled,
          source: schedule.source,
          parserVersion: schedule.parserVersion
        });
        scheduleCount++;
      }

      // Report dropped rows rather than swallowing them: a restore that quietly loses part of
      // the data is worse than one that says what it could not place.
      const dropped = backupSchedules.length - scheduleCount;
      anchorEditHistory();

      return {
        success: true,
        message: `已导入 ${courseCount} 门课程、${scheduleCount} 条课段` +
          (dropped > 0 ? `，跳过 ${dropped} 条找不到对应课程的课段` : ""),
        count: courseCount,
        skipped: dropped
      };
    } catch (e) {
      if (before) await restoreTimetable(before);
      return { success: false, message: `导入失败: ${(e as Error).message}`, count: 0 };
    }
  };

  /// A name not already taken by another course table: the base itself, else "base (2)", "base (3)".
  const uniqueCourseTableName = (base: string): string => {
    const taken = new Set(courseTables.value.map(table => table.name.trim()));
    const trimmed = base.trim();
    if (!taken.has(trimmed)) return trimmed;

    let index = 2;
    while (taken.has(`${trimmed} (${index})`)) index++;
    return `${trimmed} (${index})`;
  };

  /// Runs an import into a brand-new course table, so nothing already in the app is touched.
  ///
  /// The new table is created and switched to first, because every import path writes into the
  /// active table. If `run` then fails (or throws), the half-filled table is deleted and the table
  /// and week the user was on are put back, so a failed import leaves no empty table behind.
  const importAsNewCourseTable = async (
    baseName: string,
    run: () => Promise<{ success: boolean; message: string; count: number; skipped?: number }>
  ): Promise<{ success: boolean; message: string; count: number; skipped?: number; tableName: string }> => {
    const previousTableId = activeCourseTableId.value;
    const previousWeek = currentWeek.value;
    const tableName = uniqueCourseTableName(baseName);

    let newTableId: number | null;
    try {
      newTableId = await createCourseTable(tableName);
    } catch (e) {
      return { success: false, message: `导入失败: ${(e as Error).message}`, count: 0, tableName };
    }
    if (newTableId === null) {
      return { success: false, message: "课表名称不能为空", count: 0, tableName };
    }
    beginEmptyEditHistory();

    let result: { success: boolean; message: string; count: number; skipped?: number };
    try {
      result = await run();
    } catch (e) {
      result = { success: false, message: `导入失败: ${(e as Error).message}`, count: 0 };
    }
    if (result.success) return { ...result, tableName };

    try {
      // Point back at the old table before deleting: deleting the active table would make the
      // service pick a replacement on its own.
      await courseService.setActiveCourseTableId(previousTableId);
      activeCourseTableId.value = previousTableId;
      await courseService.forgetEditHistory(newTableId);
      await courseService.deleteCourseTable(newTableId);
      await loadDataFromDb();
      // createCourseTable moved the week to the new table's opening week.
      currentWeek.value = previousWeek;
    } catch (e) {
      console.error("Failed to remove the course table left by a failed import", e);
    }
    return { ...result, tableName };
  };

  const parsePeriods = (periodsStr: string): number[] => {
    if (typeof periodsStr !== 'string') return [];
    if (periodsStr.includes("-")) {
      const [start, end] = periodsStr.split("-").map(Number);
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    return periodsStr.split(",").map(Number);
  };

  const exportToCsv = (mode: "current-week" | "semester-base" = "current-week"): string => {
    if (mode === "semester-base") {
      return [
        "星期,开始节,结束节,课程名称,上课地点,开始周,结束周,单双周",
        ...toCsvRows(semesterSchedules.value, true)
      ].join("\n");
    }

    return [
      "星期,开始节,结束节,课程名称,上课地点",
      ...toCsvRows(effectiveSchedules.value, false)
    ].join("\n");
  };

  const exportToJsonBackup = (): string => {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      activeCourseTableId: activeCourseTableId.value,
      currentWeek: currentWeek.value,
      courses: courses.value,
      schedules: schedules.value
    }, null, 2);
  };

  return {
    courses,
    schedules,
    effectiveSchedules,
    courseTables,
    activeCourseTableId,
    activeCourseTable,
    periodConfig,
    periodSlots,
    setPeriodConfig,
    resetPeriodConfig,
    setSectionPeriodCount,
    currentWeek,
    semesterWeekCount,
    setCurrentWeek,
    semesterStartDate,
    setSemesterStartDate,
    weekDateLabels,
    weekNumberForDate,
    getSchedulesForWeek,
    getPeriodStartMinutes,
    shiftCurrentWeek,
    getDaySchedules,
    getCellCourses,
    getCourseById,
    addCourse,
    addSchedule,
    moveSchedule,
    updateOccurrenceInScope,
    removeSchedule,
    removeScheduleInScope,
    removeCourse,
    importFromCsv,
    importFromSemesterCsv,
    importFromJson,
    importFromJsonBackup,
    importAsNewCourseTable,
    exportToCsv,
    exportToJsonBackup,
    clearAll,
    editing,
    sessionCount,
    canUndoEdit,
    canRedoEdit,
    commitEdit,
    undoEdit,
    redoEdit,
    exitEditMode,
    coursesReady,    switchCourseTable,
    createCourseTable,
    renameCourseTable,
    deleteCourseTable,
    getPeriodTime,
    refreshData: loadDataFromDb
  };
}
