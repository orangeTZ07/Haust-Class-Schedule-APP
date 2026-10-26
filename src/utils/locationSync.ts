// 地点只有一个真相来源：课程的 location。课段上的 location 是「这一格不一样的教室」，
// 只能在导入时按行写入、或用户在「仅本周 / 自定义周」里单独改某一格时产生。
//
// 两种写路径都容易漏掉清理，一旦漏掉，卡片（课段优先）和编辑框（课程级）就会说不一样的话：
// 用户点保存、看到 toast，格子还是旧教室。这里把「该清哪些课段」抽成纯函数，便于测试。

import type { CourseSchedule } from "../types/course";

/// 整学期改地点后必须清掉课段级地点的课段 id。
///
/// 卡片、长按详情、提醒正文、CSV 导出一律「课段优先」（`schedule.location || course.location`），
/// 所以课段上只要还留着导入时带来的旧教室，改课程地点就等于没生效。
///
/// 清理范围是这门课的**全部**课段，而不是「同一门课同一格」：用户选的是整学期，
/// 这门课别的星期、别的节次也一样要跟着换教室；按格子过滤会漏掉它们，格子继续显示旧地点。
/// 已停课的课段没有显示意义，跳过；本来就没有课段级地点的不用动（避免无意义的写库）。
export const scheduleIdsWithOwnLocation = (
  schedules: readonly CourseSchedule[],
  courseId: number
): number[] =>
  schedules
    .filter(schedule => schedule.courseId === courseId && !schedule.isCancelled && !!schedule.location)
    .map(schedule => schedule.id);

/// 「仅本周 / 自定义周」改地点时，被搬到覆盖层的那一行怎么改。
///
/// 覆盖层是另建一门别名课程（带着新的名称/地点），这一行改挂到它下面；但如果这一行自己还留着
/// 课段级地点，卡片会继续显示旧教室 —— 编辑框（读课程级）显示新的、卡片显示旧的。
/// 因此只在真的改了字段（名称/教师/地点）时才清空它自己的地点；只改节次时保留原样。
export const patchWeeklyRowForOverlay = (
  row: CourseSchedule,
  overlayCourseId: number,
  endPeriod: number,
  fieldsChanged: boolean
): CourseSchedule => ({
  ...row,
  courseId: overlayCourseId,
  endPeriod,
  ...(fieldsChanged ? { location: undefined } : {})
});
