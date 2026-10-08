// 「这节课已经上过了吗」的判据，课表用它把上过的课变灰划掉。
//
// 判据是**这一节结束的那个钟点已经过去**。不是「今天是星期几、现在第几节」这种分开看的条件：
// 星期几和节次只有落到具体日期上才有意义 —— 翻到上一周，整周都是上过的；翻到下一周，一节都不是；
// 本周只有今天已经过去的那几节。所以按每一块自己那天的日期算，而不是按「显示的是不是本周」。
//
// 日期来自 semesterWeek.ts（和表头显示的日期是同一份换算），结束钟点来自 periodConfig
// （当天第几分钟，24:00 = 1440）。算不出日期时返回 false：算不出来就不标，
// 不能凭空把课上灰。停课（schedule.isCancelled）的课根本不进课表，这里不用管。

import type { PeriodTimeConfig } from "@/types/course";
import { periodRange } from "@/utils/periodSchedule";

export interface ClassOverInput {
  /// 这一块所在的那一天（本地零点），日期算不出来时传 null。
  day: Date | null;
  /// 这一块最后一节的节次（1 起）。跨节的课以最后一节为准。
  endPeriod: number;
  periodConfig: PeriodTimeConfig;
  now: Date;
}

export const isClassOver = ({ day, endPeriod, periodConfig, now }: ClassOverInput): boolean => {
  if (!day || Number.isNaN(day.getTime())) return false;

  const range = periodRange(periodConfig, endPeriod);
  // 节次不在当前作息里（作息被改短了、数据坏了）：不知道几点结束，就不标。
  if (!range) return false;

  // 用 Date 的分钟参数，而不是自己乘 60000 再加：结束时间是 1440（24:00）时它会自然落到第二天零点。
  const endsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, range.end);
  // 到点即算上完，所以是 <= 而不是 <。
  return endsAt.getTime() <= now.getTime();
};
