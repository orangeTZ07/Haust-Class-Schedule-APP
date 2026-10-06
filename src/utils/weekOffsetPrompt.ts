// 旧教务解析把位串下标 i 存成第 i+1 周，第 1 周因此是空的、课程整体推后一周。
// 已经写进课表的学期课段没有来源字段，分不出「教务导入」和「手填 / AI」，所以这里只提示重新导入，
// 不改任何 startWeek / endWeek。

export const WEEK_OFFSET_PROMPT_KEY = "course-mngr-week-offset-reimport-prompted";

export const WEEK_OFFSET_PROMPT = {
  title: "第 1 周是空的",
  message:
    "这份课表的学期课程都从第 2 周或更晚才开始，第 1 周没有课。这通常是以前从教务系统导入时，周次被整体推后了一周。\n\n请重新导入来对齐周次。你在这段时间里单独改过或停过的某一周，是按当时看到的日历改的；如果选覆盖当前课表重新导入，这些改动会被清掉。",
  confirmText: "去重新导入",
  cancelText: "以后再说"
};

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WeekSegment {
  scope?: string;
  startWeek: number;
  endWeek: number;
  weekType?: string;
}

/// Same week rules as isScheduleActiveInWeek in useCourses.ts. Semester segments only.
const activeInWeek = (segment: WeekSegment, week: number): boolean => {
  if ((segment.scope ?? "semester") !== "semester") return false;
  if (week < segment.startWeek || week > segment.endWeek) return false;
  if (segment.weekType === "odd") return week % 2 === 1;
  if (segment.weekType === "even") return week % 2 === 0;
  return true;
};

/// True when every semester segment misses week 1 and the earliest of them starts at week 2+.
/// No semester segments (empty timetable, or only single-week edits) is not this case.
export const semesterNeedsReimport = (segments: WeekSegment[]): boolean => {
  const semester = segments.filter(segment => (segment.scope ?? "semester") === "semester");
  if (semester.length === 0) return false;
  if (semester.some(segment => activeInWeek(segment, 1))) return false;
  const earliest = Math.min(...semester.map(segment => segment.startWeek));
  return earliest >= 2;
};

const readTableIds = (storage: StorageLike): number[] => {
  const raw = storage.getItem(WEEK_OFFSET_PROMPT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === "number");
  } catch {
    return [];
  }
};

/// One prompt per course table. A later table that still looks shifted can ask once; this one does not ask again.
export const wasReimportPrompted = (tableId: number, storage: StorageLike): boolean =>
  readTableIds(storage).includes(tableId);

export const markReimportPrompted = (tableId: number, storage: StorageLike): void => {
  const ids = readTableIds(storage);
  if (ids.includes(tableId)) return;
  storage.setItem(WEEK_OFFSET_PROMPT_KEY, JSON.stringify([...ids, tableId]));
};
