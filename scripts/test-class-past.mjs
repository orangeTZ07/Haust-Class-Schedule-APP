// 「已经上过的课」：日期换算（semesterWeek）+ 上过没有的判据（classOver），以及接线。
//
// 这一条最怕的不是算错，而是**看着对**：课上灰了、划掉了，但灰错了日子（比如把明天的课也划掉，
// 或者翻到上一周却一节都没灰）。所以下面每个日期都是当场写死的，不读任何跑出来的产物。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const week = await loadTs(join(here, "..", "src/utils/semesterWeek.ts"));
const over = await loadTs(join(here, "..", "src/utils/classOver.ts"));
const ps = await loadTs(join(here, "..", "src/utils/periodSchedule.ts"));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const SEMESTER_START = "2026-08-31";
const at = (y, m, d, hh = 0, mm = 0, ss = 0, ms = 0) => new Date(y, m - 1, d, hh, mm, ss, ms);
const stamp = (date) =>
  date === null
    ? "null"
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const defaults = ps.createDefaultPeriodConfig();

console.log("=== 第几周星期几是哪一天 ===");
{
  check("第 1 周周一 = 学期开始日", stamp(week.weekDayDate(SEMESTER_START, 1, 1)) === "2026-08-31", stamp(week.weekDayDate(SEMESTER_START, 1, 1)));
  check("第 1 周周日 = 09-06", stamp(week.weekDayDate(SEMESTER_START, 1, 7)) === "2026-09-06", stamp(week.weekDayDate(SEMESTER_START, 1, 7)));
  // 和 useCourses 里 weekDateLabels 的文档一致：第 4 周是 09-21..09-27。
  check("第 4 周周一 = 09-21（与表头文档一致）", stamp(week.weekDayDate(SEMESTER_START, 4, 1)) === "2026-09-21", stamp(week.weekDayDate(SEMESTER_START, 4, 1)));
  check("第 6 周周一 = 10-05（跨月）", stamp(week.weekDayDate(SEMESTER_START, 6, 1)) === "2026-10-05", stamp(week.weekDayDate(SEMESTER_START, 6, 1)));
  // 周一 = 1 要和 useToday 里 `day === 0 ? 7 : day` 的编号对上。
  check("周一 = 1 对得上 Date 的星期编号", week.weekDayDate(SEMESTER_START, 6, 1).getDay() === 1 && week.weekDayDate(SEMESTER_START, 6, 7).getDay() === 0);
  check("跨年也照算", stamp(week.weekDayDate(SEMESTER_START, 20, 1)) === "2027-01-11", stamp(week.weekDayDate(SEMESTER_START, 20, 1)));
  check("第 36 周周一 = 2027-05-03", stamp(week.weekDayDate(SEMESTER_START, 36, 1)) === "2027-05-03", stamp(week.weekDayDate(SEMESTER_START, 36, 1)));
}

console.log("");
console.log("=== 算不出日期时返回 null ===");
{
  check("空字符串", week.weekDayDate("", 1, 1) === null);
  check("格式不对（月份没补零）", week.weekDayDate("2026-8-31", 1, 1) === null);
  check("不是日期", week.weekDayDate("2026/08/31", 1, 1) === null);
  check("周次 0", week.weekDayDate(SEMESTER_START, 0, 1) === null);
  check("周次 1.5", week.weekDayDate(SEMESTER_START, 1.5, 1) === null);
  check("星期几 0", week.weekDayDate(SEMESTER_START, 1, 0) === null);
  check("星期几 8", week.weekDayDate(SEMESTER_START, 1, 8) === null);
  check("parseIsoDate 读本地零点", week.parseIsoDate("2026-08-31").getHours() === 0 && week.parseIsoDate("2026-08-31").getDate() === 31);
}

console.log("");
console.log("=== 一节 45 分钟的课什么时候算上完 ===");
{
  const monday = week.weekDayDate(SEMESTER_START, 6, 1); // 2026-10-05
  const cases = [
    ["第 2 节（08:55-09:40）09:39:59 还没完", at(2026, 10, 5, 9, 39, 59, 999), 2, false],
    ["第 2 节 09:40:00 整点算完", at(2026, 10, 5, 9, 40, 0, 0), 2, true],
    ["第 2 节 09:40:00 之后算完", at(2026, 10, 5, 9, 40, 0, 1), 2, true],
    ["第 1 节 08:45 算完", at(2026, 10, 5, 8, 45), 1, true],
    ["第 1 节 08:44 还没完", at(2026, 10, 5, 8, 44), 1, false],
    ["跨节（1-3 节，到 10:45）10:30 还没完", at(2026, 10, 5, 10, 30), 3, false],
    ["跨节（1-3 节）10:45 算完", at(2026, 10, 5, 10, 45), 3, true],
    ["最后一节（20:40-21:25）21:30 算完", at(2026, 10, 5, 21, 30), 12, true],
    ["最后一节 20:00 还没上课", at(2026, 10, 5, 20, 0), 12, false],
    ["以本地时间算，不是 UTC", at(2026, 10, 5, 9, 45), 2, true]
  ];
  for (const [name, now, endPeriod, expected] of cases) {
    const actual = over.isClassOver({ day: monday, endPeriod, periodConfig: defaults, now });
    check(name, actual === expected, { now: now.toString(), endPeriod, actual, expected });
  }
}

console.log("");
console.log("=== 同一周里，只看已经过去的那几天 ===");
{
  const now = at(2026, 10, 7, 12, 0); // 第 6 周周三中午
  const args = (dayOfWeek, endPeriod) => ({
    day: week.weekDayDate(SEMESTER_START, 6, dayOfWeek),
    endPeriod,
    periodConfig: defaults,
    now
  });
  check("本周周一：全天上过", over.isClassOver(args(1, 12)) === true);
  check("本周周二：上过", over.isClassOver(args(2, 2)) === true);
  check("本周周三上午：上过", over.isClassOver(args(3, 1)) === true);
  check("本周周三下午（14:00 那节）：还没到", over.isClassOver(args(3, 5)) === false);
  check("本周周四：没到", over.isClassOver(args(4, 2)) === false);
  check("本周周日：没到", over.isClassOver(args(7, 2)) === false);
  check("周三半夜（00:00）：第一节还没上", over.isClassOver({ ...args(3, 1), now: at(2026, 10, 7, 0, 0) }) === false);
}

console.log("");
console.log("=== 上一周全灰、下一周一节不灰 ===");
{
  const now = at(2026, 10, 7, 12, 0); // 第 6 周
  const earlier = week.weekDayDate(SEMESTER_START, 3, 5); // 第 3 周周五
  const later = week.weekDayDate(SEMESTER_START, 8, 2); // 第 8 周周二
  const arg = (day) => ({ day, endPeriod: 12, periodConfig: defaults, now });
  check("第 3 周的课：上过", over.isClassOver(arg(earlier)) === true);
  check("第 8 周的课：没上过", over.isClassOver(arg(later)) === false);
  check("今天同日的下一周（第 7 周周三）：没到", over.isClassOver({ ...arg(week.weekDayDate(SEMESTER_START, 7, 3)), now: at(2026, 10, 7, 23, 59) }) === false);
}

console.log("");
console.log("=== 算不出来就不标 ===");
{
  const now = at(2026, 10, 7, 12, 0);
  const base = { endPeriod: 2, periodConfig: defaults, now };
  check("没有日期（学期开始日读不出来）", over.isClassOver({ ...base, day: null }) === false);
  check("日期是 Invalid Date", over.isClassOver({ ...base, day: new Date("nope") }) === false);
  check("节次超出作息（作息被改短了）", over.isClassOver({ ...base, day: at(2026, 10, 5), endPeriod: 99 }) === false);
  check("节次是 0", over.isClassOver({ ...base, day: at(2026, 10, 5), endPeriod: 0 }) === false);
  check("空作息", over.isClassOver({ ...base, day: at(2026, 10, 5), periodConfig: { morningPeriods: 0, afternoonPeriods: 0, eveningPeriods: 0, periods: [] } }) === false);
}

console.log("");
console.log("=== 24:00 下课的那一节（结束时间可能落在第二天零点）===");
{
  const shifted = ps.applySectionStart(defaults, "evening", 21 * 60 + 35);
  check("晚课推到 21:35 后最后一节是 23:15-24:00", shifted.ok === true && ps.formatPeriodRange(shifted.config.periods[11]) === "23:15-24:00");
  const config = shifted.ok ? shifted.config : defaults;
  const monday = week.weekDayDate(SEMESTER_START, 6, 1);
  const arg = (now) => ({ day: monday, endPeriod: 12, periodConfig: config, now });
  check("当天 23:59 还没上完", over.isClassOver(arg(at(2026, 10, 5, 23, 59, 59))) === false);
  check("第二天 00:00 算上完（跨到第二天零点）", over.isClassOver(arg(at(2026, 10, 6, 0, 0, 0))) === true);
}

console.log("");
console.log("=== 接线（读源码）===");
{
  const grid = readFileSync(join(here, "..", "src/components/timetable/WeekGrid.vue"), "utf8");
  const binding = ':is-past="isPastBlock(block.schedule.id)"';
  const bindings = grid.split(binding).length - 1;
  check("课表把上过没有传下去：网格 + 冲突浮层各一处", bindings === 2, bindings);
  check("课表不自己取时钟，用 useToday 那一只", grid.includes("const { now, todayDayNumber: calendarDayNumber, actualWeek } = useToday()"));
  check("日期换算走 semesterWeek", grid.includes("import { weekDayDate } from") && grid.includes("weekDayDate(semesterStartDate.value, currentWeek.value, block.schedule.dayOfWeek)"));
  check("判据走 classOver", grid.includes("import { isClassOver } from") && grid.includes("endPeriod: block.schedule.endPeriod"));

  const courses = readFileSync(join(here, "..", "src/composables/useCourses.ts"), "utf8");
  check("表头日期和「上过没有」是同一份换算", courses.includes("weekDayDate(semesterStartDate.value, currentWeek.value, index + 1)"));
  check("parseIsoDate 只剩一份（useCourses 里不再自带）", !courses.includes("const parseIsoDate") && courses.includes("import { parseIsoDate, weekDayDate } from"));

  const today = readFileSync(join(here, "..", "src/composables/useToday.ts"), "utf8");
  check("useToday 把时钟给出去", today.includes("return { now, todayDayNumber, actualWeek }"));
  check("前台按分钟重读，后台停掉", today.includes("setInterval") && today.includes("if (document.hidden) {") && today.includes("stopLiveTick()"));

  // 样式写了要生效：is-past 规则里点名的每个类名，都得真的在 CourseBlock 的模板里。
  //
  // 只看后代选择器里最后那一段（`.course-block.is-past .course-name` 里的 course-name）：
  // 复合在选择器上的 is-expanded / is-dragging 这类状态类本来就只出现在 :class 绑定里，
  // 不该拿模板里的 class="..." 去要求它们。
  const block = readFileSync(join(here, "..", "src/components/timetable/CourseBlock.vue"), "utf8");
  const template = block.slice(0, block.indexOf("<style"));
  const stateClasses = new Set(["is-past", "is-expanded", "is-dragging", "is-deleting", "is-conflicting"]);
  check("CourseBlock 收到 isPast 并挂上 is-past", block.includes("'is-past': isPast") && block.includes("isPast: false"));
  const named = new Set();
  for (const rule of block.match(/\.course-block\.is-past[^{]*/g) || []) {
    for (const selector of rule.split(",")) {
      const compounds = selector.trim().split(/\s+/);
      // 只有一个复合选择器（就是 .course-block.is-past 自己）时，没有点名别的类。
      if (compounds.length < 2) continue;
      for (const token of compounds[compounds.length - 1].match(/\.[A-Za-z0-9_-]+/g) || []) {
        const name = token.slice(1);
        if (!stateClasses.has(name)) named.add(name);
      }
    }
  }
  check("样式点到的类名不止一个（否则规则是空的）", named.size >= 3, [...named]);
  for (const name of named) {
    check(`模板里真的有 .${name}`, template.includes(`class="${name}"`), name);
  }
  check("变灰：grayscale", /\.course-block\.is-past\s*\{[^}]*grayscale\(1\)/.test(block));
  check("划掉：line-through 加在课程名上", /\.course-block\.is-past\s+\.course-name[\s\S]{0,200}line-through/.test(block));
}

console.log("");
console.log(failed === 0 ? "  ALL CHECKS PASSED" : "  " + failed + " CHECK(S) FAILED");
process.exit(failed ? 1 : 0);
