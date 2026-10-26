// 地点和教师都只有一个真相来源：课程上的那一个字段。课段上的同名字段是「这一格不一样」，
// 只能在导入时按行写入、或用户在「仅本周 / 自定义周」里单独改某一格时产生。
//
// 两种写路径都容易漏掉清理，一旦漏掉，卡片（课段优先）和编辑框（课程级）就会说不一样的话：
// 用户点保存、看到 toast，格子还是旧教室/旧老师。这里把「该清哪些课段」抽成纯函数，便于测试。

import type { CourseSchedule } from "../types/course";

/// 课段上会覆盖课程级值的字段。地点和教师走完全相同的规则。
export type ScheduleOwnField = "location" | "teacher";

/// 整学期改完之后必须清掉课段级值（该字段）的课段 id。
///
/// 卡片、长按详情、提醒正文、CSV 导出一律「课段优先」（`schedule.location || course.location`），
/// 所以课段上只要还留着导入时带来的旧值，改课程就等于没生效。
///
/// 清理范围是这门课的**全部**课段，而不是「同一门课同一格」：用户选的是整学期，
/// 这门课别的星期、别的节次也一样要跟着改；按格子过滤会漏掉它们，格子继续显示旧值。
/// 已停课的课段没有显示意义，跳过；本来就没有课段级值的不用动（避免无意义的写库）。
export const scheduleIdsWithOwnField = (
  schedules: readonly CourseSchedule[],
  courseId: number,
  field: ScheduleOwnField
): number[] =>
  schedules
    .filter(schedule => schedule.courseId === courseId && !schedule.isCancelled && !!schedule[field])
    .map(schedule => schedule.id);

export const scheduleIdsWithOwnLocation = (
  schedules: readonly CourseSchedule[],
  courseId: number
): number[] => scheduleIdsWithOwnField(schedules, courseId, "location");

export const scheduleIdsWithOwnTeacher = (
  schedules: readonly CourseSchedule[],
  courseId: number
): number[] => scheduleIdsWithOwnField(schedules, courseId, "teacher");

/// 「仅本周 / 自定义周」改字段时，被搬到覆盖层的那一行怎么改。
///
/// 覆盖层是另建一门别名课程（带着新的名称/教师/地点），这一行改挂到它下面；但如果这一行自己
/// 还留着课段级的旧值，卡片会继续显示旧值 —— 编辑框（读课程级）显示新的、卡片显示旧的。
/// 因此**只清用户真的改了的那个字段**：只改地点时，这一行自己的教师（导入时带来的那一位）
/// 必须留着，否则它会变成课程级投票出来的老师。
export const patchWeeklyRowForOverlay = (
  row: CourseSchedule,
  overlayCourseId: number,
  endPeriod: number,
  changed: { location: boolean; teacher: boolean }
): CourseSchedule => ({
  ...row,
  courseId: overlayCourseId,
  endPeriod,
  ...(changed.location ? { location: undefined } : {}),
  ...(changed.teacher ? { teacher: undefined } : {})
});
