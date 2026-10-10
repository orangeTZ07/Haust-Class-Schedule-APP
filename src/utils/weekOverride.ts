// 某一周的覆盖层会藏起它要替换的那条学期课。
//
// 只藏同一门课自己的学期安排。拖到别人的格子上时，两节课时间会叠在一起，那是冲突，
// 两节都要留在课表上。如果按「时间重叠就把学期课藏掉」，被盖住的那门课会从这一周消失。

export interface WeekSpan {
  courseId: number;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
}

const spansOverlap = (first: WeekSpan, second: WeekSpan) =>
  first.dayOfWeek === second.dayOfWeek &&
  first.startPeriod <= second.endPeriod &&
  second.startPeriod <= first.endPeriod;

export const baseHiddenByWeekly = (base: WeekSpan, weeklyRows: WeekSpan[]): boolean =>
  weeklyRows.some(weekly => weekly.courseId === base.courseId && spansOverlap(base, weekly));
