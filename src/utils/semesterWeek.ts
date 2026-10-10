// 学期日历的换算：学期开始日 + 第几周 + 星期几 → 那一天的日期。
//
// 全项目只有这一份实现：表头显示的日期（useCourses 的 weekDateLabels）和「这节课上过没有」的
// 判定（classOver.ts，经 WeekGrid）都走这里。分成两份迟早会差一天，而日期差一天这种错最难发现 ——
// 课表看上去完全正常，只是排在了错的日子。
//
// 日期一律按本地时间构造：`new Date("2026-08-31")` 读出来是 UTC 零点，在 UTC 之后的时区会整体
// 落到前一天。

/// "YYYY-MM-DD" → 当天的本地零点；格式不对返回 null。
///
/// 按年月日逐个取，而不是 Date.parse：裸日期串会被当成 UTC 零点，
/// 每差一个时区就可能少一天 —— 而设置这个日期的人正好在那些时区里。
export const parseIsoDate = (iso: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

/// 第 week 周、星期 dayOfWeek（周一 = 1）那一天的本地零点。
///
/// 学期开始日读不出来、或周次 / 星期几不是一个合理的整数时返回 null：调用方一律当「算不出来」处理，
/// 而不是硬算出一个日期。第 1 周第 1 天就是学期开始日本身。
export const weekDayDate = (semesterStart: string, week: number, dayOfWeek: number): Date | null => {
  const start = parseIsoDate(semesterStart);
  if (!start) return null;
  if (!Number.isInteger(week) || week < 1) return null;
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) return null;

  return new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + (week - 1) * 7 + (dayOfWeek - 1)
  );
};
