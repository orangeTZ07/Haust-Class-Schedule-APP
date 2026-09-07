import { ref, computed, watch } from "vue";
import type { Course, CourseSchedule, CourseImportItem, CourseTable, PeriodTimeConfig } from "@/types/course";
import { parseCSV, parseSemesterCSV, type ParsedCourse } from "@/utils/csvImporter";
import * as courseService from "@/services/courseService";

const COLORS = [
  "#1989fa", "#07c160", "#ff976a", "#ee0a24", "#7232dd",
  "#ffcd00", "#14c4c4", "#f97316", "#8b5cf6", "#ec4899",
  "#10b981", "#6366f1"
];

const defaultConfig: PeriodTimeConfig = {
  morningStart: "08:00",
  afternoonStart: "14:00",
  eveningStart: "19:00",
  periodDuration: 45,
  breakDuration: 10,
  longBreakDuration: 20,
  morningPeriods: 4,
  afternoonPeriods: 4,
  eveningPeriods: 2
};

const courses = ref<Course[]>([]);
const schedules = ref<CourseSchedule[]>([]);
const courseTables = ref<CourseTable[]>([]);
const activeCourseTableId = ref<number>(1);
const periodConfig = ref<PeriodTimeConfig>({ ...defaultConfig });
const currentWeek = ref(1);

let nextCourseId = 1;
let nextScheduleId = 1;

const STORAGE_KEYS = {
  PERIOD_CONFIG: "course-mngr-period-config",
  CURRENT_WEEK: "course-mngr-current-week"
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

    const savedPeriodConfig = localStorage.getItem(STORAGE_KEYS.PERIOD_CONFIG);
    if (savedPeriodConfig) {
      periodConfig.value = JSON.parse(savedPeriodConfig);
    }

    const savedCurrentWeek = Number(localStorage.getItem(STORAGE_KEYS.CURRENT_WEEK));
    if (Number.isFinite(savedCurrentWeek) && savedCurrentWeek > 0) {
      currentWeek.value = savedCurrentWeek;
    }
  } catch (e) {
    console.error("Failed to load data from SQLite", e);
  }
}

// Initial Load
loadDataFromDb();

export function useCourses() {
  // Watch for config changes and save to localStorage (config remains in localStorage for simplicity)
  watch(periodConfig, () => {
    localStorage.setItem(STORAGE_KEYS.PERIOD_CONFIG, JSON.stringify(periodConfig.value));
  }, { deep: true });

  watch(currentWeek, () => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_WEEK, String(currentWeek.value));
  });

  const semesterWeekCount = computed(() => {
    const maxImportedWeek = schedules.value.reduce((max, schedule) => Math.max(max, schedule.endWeek), 0);
    return Math.max(maxImportedWeek, 20);
  });

  const semesterSchedules = computed(() => {
    return schedules.value.filter(schedule => getScheduleScope(schedule) === "semester");
  });

  const effectiveSchedules = computed(() => {
    const baseSchedules = semesterSchedules.value.filter(schedule => isScheduleActiveInWeek(schedule, currentWeek.value));
    const weeklySchedules = schedules.value.filter(schedule => {
      return getScheduleScope(schedule) === "weekly" && isScheduleActiveInWeek(schedule, currentWeek.value);
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
  });

  const activeCourseTable = computed(() => {
    return courseTables.value.find(table => table.id === activeCourseTableId.value) || courseTables.value[0] || null;
  });

  const setCurrentWeek = (week: number) => {
    currentWeek.value = Math.min(Math.max(Math.round(week), 1), semesterWeekCount.value);
  };

  const shiftCurrentWeek = (offset: number) => {
    setCurrentWeek(currentWeek.value + offset);
  };

  const getPeriodTime = (period: number): string => {
    const config = periodConfig.value;
    const [morningH, morningM] = config.morningStart.split(":").map(Number);
    const [afternoonH, afternoonM] = config.afternoonStart.split(":").map(Number);
    const [eveningH, eveningM] = (config.eveningStart || "19:00").split(":").map(Number);

    let startTimeMinutes: number;
    let sectionStartTime: number;
    let localPeriod: number;

    if (period <= config.morningPeriods) {
      sectionStartTime = morningH * 60 + morningM;
      localPeriod = period;
    } else if (period <= config.morningPeriods + config.afternoonPeriods) {
      sectionStartTime = afternoonH * 60 + afternoonM;
      localPeriod = period - config.morningPeriods;
    } else {
      sectionStartTime = eveningH * 60 + eveningM;
      localPeriod = period - config.morningPeriods - config.afternoonPeriods;
    }

    const bigBlocks = Math.floor((localPeriod - 1) / 2);
    const isSecondInBlock = (localPeriod - 1) % 2 === 1;
    
    startTimeMinutes = sectionStartTime + 
      bigBlocks * (config.periodDuration * 2 + config.breakDuration + config.longBreakDuration) +
      (isSecondInBlock ? (config.periodDuration + config.breakDuration) : 0);

    const format = (minutes: number) => {
      const h = Math.floor(minutes / 60).toString().padStart(2, "0");
      const m = (minutes % 60).toString().padStart(2, "0");
      return `${h}:${m}`;
    };

    return `${format(startTimeMinutes)}-${format(startTimeMinutes + config.periodDuration)}`;
  };

  const periodSlots = computed(() => {
    const config = periodConfig.value;
    const totalPeriods = config.morningPeriods + config.afternoonPeriods + (config.eveningPeriods || 0);
    const slots = [];
    for (let i = 1; i <= totalPeriods; i++) {
      let section: "morning" | "afternoon" | "evening";
      if (i <= config.morningPeriods) {
        section = "morning";
      } else if (i <= config.morningPeriods + config.afternoonPeriods) {
        section = "afternoon";
      } else {
        section = "evening";
      }
      slots.push({
        period: i,
        time: getPeriodTime(i),
        section
      });
    }
    return slots;
  });

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

  const addCourse = async (name: string, teacher?: string, location?: string): Promise<Course> => {
    const colorIndex = courses.value.length % COLORS.length;
    const courseData = {
      name,
      teacher,
      location,
      color: COLORS[colorIndex]
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
    options: Partial<Pick<CourseSchedule, "startWeek" | "endWeek" | "weekType" | "scope" | "isCancelled">> = {}
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
      isCancelled: options.isCancelled ?? false
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

  const removeSchedule = async (id: number): Promise<boolean> => {
    const index = schedules.value.findIndex(s => s.id === id);
    if (index === -1) return false;

    const current = schedules.value[index];
    if (getScheduleScope(current) === "semester" && isScheduleActiveInWeek(current, currentWeek.value)) {
      await addSchedule(current.courseId, current.dayOfWeek, current.startPeriod, current.endPeriod, {
        startWeek: currentWeek.value,
        endWeek: currentWeek.value,
        weekType: "all",
        scope: "weekly",
        isCancelled: true
      });
      return true;
    }

    await courseService.deleteSchedule(id);
    schedules.value.splice(index, 1);
    return true;
  };

  const clearAll = async () => {
    await courseService.clearAllData();
    courses.value = [];
    schedules.value = [];
    nextCourseId = 1;
    nextScheduleId = 1;
  };

  const switchCourseTable = async (id: number) => {
    await courseService.setActiveCourseTableId(id);
    activeCourseTableId.value = id;
    currentWeek.value = 1;
    await loadDataFromDb();
  };

  const createCourseTable = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const id = await courseService.addCourseTable(trimmed);
    await courseService.setActiveCourseTableId(id);
    activeCourseTableId.value = id;
    currentWeek.value = 1;
    await loadDataFromDb();
    return id;
  };

  const renameCourseTable = async (id: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    await courseService.renameCourseTable(id, trimmed);
    await loadDataFromDb();
  };

  const deleteCourseTable = async (id: number) => {
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
    try {
      const items = parseCSV(csvStr);
      if (items.length === 0) {
        return { success: false, message: "未识别到有效的 CSV 数据", count: 0 };
      }

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

      return { success: true, message: `成功导入第 ${currentWeek.value} 周的 ${count} 门课程`, count };
    } catch (e) {
      return { success: false, message: `导入失败: ${(e as Error).message}`, count: 0 };
    }
  };

  const importFromSemesterCsv = async (csvStr: string, overwrite: boolean = false): Promise<{ success: boolean; message: string; count: number }> => {
    try {
      const items = parseSemesterCSV(csvStr);
      if (items.length === 0) {
        return { success: false, message: "未识别到有效的学期 CSV 数据", count: 0 };
      }

      if (overwrite) {
        await clearAll();
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

      return { success: true, message: `成功导入 ${count} 门课程`, count };
    } catch (e) {
      return { success: false, message: `导入失败: ${(e as Error).message}`, count: 0 };
    }
  };

  const importFromJson = async (jsonStr: string): Promise<{ success: boolean; message: string; count: number }> => {
    try {
      const items: CourseImportItem[] = JSON.parse(jsonStr);
      if (!Array.isArray(items)) {
        return { success: false, message: "JSON 必须是数组格式", count: 0 };
      }

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

      return { success: true, message: `成功导入 ${count} 门课程`, count };
    } catch (e) {
      return { success: false, message: `JSON 解析错误: ${(e as Error).message}`, count: 0 };
    }
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
    currentWeek,
    semesterWeekCount,
    setCurrentWeek,
    shiftCurrentWeek,
    getDaySchedules,
    getCellCourses,
    getCourseById,
    addCourse,
    addSchedule,
    moveSchedule,
    removeSchedule,
    removeCourse,
    importFromCsv,
    importFromSemesterCsv,
    importFromJson,
    exportToCsv,
    exportToJsonBackup,
    clearAll,
    switchCourseTable,
    createCourseTable,
    renameCourseTable,
    deleteCourseTable,
    getPeriodTime,
    refreshData: loadDataFromDb
  };
}
