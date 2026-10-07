// 课表上拖到垃圾桶删除时，周次范围怎么落到具体周。
// 和加课的「整学期 / 仅当前周 / 自定义周次」同一套选项；真正改库在 useCourses。

import type { CourseSchedule } from "@/types/course";

export type DeleteWeekScope = "all" | "current" | "custom";
export type DeleteWeekType = "all" | "odd" | "even";

export interface DeleteScopePayload {
  weekScope: DeleteWeekScope;
  startWeek?: number;
  endWeek?: number;
  weekType?: DeleteWeekType;
}

export const DELETE_SEMESTER_CONFIRM = {
  title: "删除整学期？",
  message: "本学期这门都会没。",
  confirmText: "删除"
} as const;

export const weekMatchesType = (week: number, weekType: DeleteWeekType): boolean => {
  if (weekType === "odd") return week % 2 === 1;
  if (weekType === "even") return week % 2 === 0;
  return true;
};

export const customWeeks = (startWeek: number, endWeek: number, weekType: DeleteWeekType): number[] => {
  const start = Math.min(startWeek, endWeek);
  const end = Math.max(startWeek, endWeek);
  const weeks: number[] = [];
  for (let week = start; week <= end; week++) {
    if (weekMatchesType(week, weekType)) weeks.push(week);
  }
  return weeks;
};

/// "all" 表示整学期；否则是要去掉的那些周。
export const weeksForDeleteScope = (
  payload: DeleteScopePayload,
  currentWeek: number
): "all" | number[] => {
  if (payload.weekScope === "all") return "all";
  if (payload.weekScope === "current") return [currentWeek];
  return customWeeks(
    payload.startWeek ?? currentWeek,
    payload.endWeek ?? currentWeek,
    payload.weekType ?? "all"
  );
};

export const sameOccurrence = (left: CourseSchedule, right: CourseSchedule): boolean =>
  left.courseId === right.courseId &&
  left.dayOfWeek === right.dayOfWeek &&
  left.startPeriod === right.startPeriod &&
  left.endPeriod === right.endPeriod;

const getScope = (schedule: CourseSchedule) => schedule.scope ?? "semester";

export const isScheduleActiveInWeek = (schedule: CourseSchedule, week: number): boolean => {
  if (week < schedule.startWeek || week > schedule.endWeek) return false;
  return weekMatchesType(week, schedule.weekType);
};

/// 整学期：同一门课、同一格的学期课段和按周覆盖层都去掉。
export const idsForSemesterDelete = (
  schedules: readonly CourseSchedule[],
  target: CourseSchedule
): number[] =>
  schedules.filter(schedule => sameOccurrence(schedule, target)).map(schedule => schedule.id);

export interface WeeklyCancelDraft {
  courseId: number;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  week: number;
}

/// 只删某些周时，已经有的按周取消层不必再加一条。
export const needsWeeklyCancel = (
  schedules: readonly CourseSchedule[],
  target: CourseSchedule,
  week: number
): boolean => {
  if (!isScheduleActiveInWeek(target, week)) return false;
  if (getScope(target) === "weekly") return false;
  return !schedules.some(schedule =>
    sameOccurrence(schedule, target) &&
    getScope(schedule) === "weekly" &&
    schedule.isCancelled &&
    schedule.startWeek === week &&
    schedule.endWeek === week
  );
};

export const weeklyRowToDelete = (
  schedules: readonly CourseSchedule[],
  target: CourseSchedule,
  week: number
): CourseSchedule | null => {
  if (getScope(target) === "weekly" && target.startWeek === week && target.endWeek === week) {
    return target;
  }
  return schedules.find(schedule =>
    sameOccurrence(schedule, target) &&
    getScope(schedule) === "weekly" &&
    !schedule.isCancelled &&
    schedule.startWeek === week &&
    schedule.endWeek === week
  ) ?? null;
};

export const cancelDraftForWeek = (
  target: CourseSchedule,
  week: number
): WeeklyCancelDraft => ({
  courseId: target.courseId,
  dayOfWeek: target.dayOfWeek,
  startPeriod: target.startPeriod,
  endPeriod: target.endPeriod,
  week
});
