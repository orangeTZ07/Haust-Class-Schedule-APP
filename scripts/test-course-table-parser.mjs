// courseTableParser 的断言。
//
// 两部分：
//   A. 合成用例 —— 覆盖周次压缩的各种形态，永远运行
//   B. 真实响应 —— 用真机抓下来的 HTML 核对解析结果，文件不存在就跳过
//
// 第二部分是重点。合成用例只能证明逻辑自洽；真实响应才能证明规则是从数据里读出来的，而不是
// 我照着推测写的。真实响应**不放进仓库**（里面有本人的姓名与课表），所以按路径读取、缺失即跳过。
//
// 用法: node scripts/test-course-table-parser.mjs [真实HTML路径]

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const parser = await loadTs(join(here, "..", "src", "services", "eams", "courseTableParser.ts"));

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (!ok && detail !== undefined ? "   <- " + JSON.stringify(detail) : ""));
  if (!ok) failures++;
};

// ---------- A. 合成用例：周次 → 范围 ----------
console.log("=== A. 周次压缩（合成用例）===");
const span = (weeks) => parser.toWeekSpans(weeks).map((s) => `${s.startWeek}-${s.endWeek}/${s.weekType}`);

check("连续 1..16 -> 一条 all", span([...Array(16)].map((_, i) => i + 1)).join(" ") === "1-16/all", span([...Array(16)].map((_, i) => i + 1)));
check("奇数 1,3..15 -> 一条 odd", span([1, 3, 5, 7, 9, 11, 13, 15]).join(" ") === "1-15/odd", span([1, 3, 5, 7, 9, 11, 13, 15]));
check("偶数 2,4,6,8 -> 一条 even", span([2, 4, 6, 8]).join(" ") === "2-8/even", span([2, 4, 6, 8]));
check("[3,4,5,6,9] -> 拆成 3-6 与 9", span([3, 4, 5, 6, 9]).join(" ") === "3-6/all 9-9/all", span([3, 4, 5, 6, 9]));
check("空周次 -> 整学期兜底", parser.toWeekSpans([])[0].approximated === true);
check("位串 0101 -> 第 2、4 周", JSON.stringify(parser.weeksFromBits("0101")) === "[2,4]", parser.weeksFromBits("0101"));

// ---------- B. 真实响应 ----------
const realPath = process.argv[2] || "D:/Deepseek/Harness/haust-spider/dump_jwgl.haust.edu.cn_coursetable.html";

console.log("");
if (!existsSync(realPath)) {
  console.log("=== B. 真实响应：跳过 ===");
  console.log("  未找到 " + realPath);
  console.log("  这是本机专有的固件（含个人课表，不入仓库），缺失时只跑合成用例。");
} else {
  console.log("=== B. 真实响应 ===");
  console.log("  文件: " + resolve(realPath));

  const html = readFileSync(realPath, "utf8");
  const { rows, problems } = parser.parseCourseTable(html);

  check("解析出 34 条活动", rows.length === 34, rows.length);
  check("没有解析失败项", problems.length === 0, problems);

  // 星期分布 —— 这是"N 即星期、0 起算"的直接证据
  const byDay = {};
  rows.forEach((r) => { byDay[r.day_of_week] = (byDay[r.day_of_week] || 0) + 1; });
  const expectedDays = { 1: 9, 2: 8, 3: 8, 4: 3, 5: 6 };
  check("按星期分布与实测一致 (周一9 周二8 周三8 周四3 周五6)", JSON.stringify(byDay) === JSON.stringify(expectedDays), byDay);
  check("没有周六周日", !rows.some((r) => r.day_of_week >= 6));

  // 字段下标
  const linAlg = rows.filter((r) => r.course_name === "线性代数B");
  check("课程名解析正确（去掉课程代码）", linAlg.length === 2, rows.map((r) => r.course_name).slice(0, 5));
  check("教室解析正确", linAlg.every((r) => r.room.includes("4-106")), linAlg.map((r) => r.room));
  check("节次解析正确", linAlg.every((r) => r.start_unit === 1 || r.start_unit === 3), linAlg.map((r) => [r.start_unit, r.end_unit]));

  // `var teachers` 出现在活动之后，所以脚本里的最后一条活动页面上没有这一行（实测 33/34 条有）。
  // 这里刻意**不**用"往前取"去补：实测 33 条里有 18 条前后不一致，往前取等于把教师错位一位，
  // 会写错 18 位教师 —— 取错教师比取不到更糟。最后那一条由分组的"出现最多"兜住。
  check("33/34 条能从 var teachers 取到教师", rows.filter((r) => r.teacher).length === 33, rows.filter((r) => r.teacher).length);
  check("能取到的那条是李学军", linAlg.filter((r) => r.teacher).every((r) => r.teacher === "李学军"), linAlg.map((r) => r.teacher));

  // 周次 —— 用"两周三节"这个已知事实反证位串格式
  const mon = linAlg.find((r) => r.day_of_week === 1);
  const fri = linAlg.find((r) => r.day_of_week === 5);
  check("线性代数B 有周一那条", !!mon);
  check("线性代数B 有周五那条", !!fri);
  if (mon && fri) {
    check("周一那条是连续第 2-14 周", JSON.stringify(mon.weeks) === JSON.stringify([...Array(13)].map((_, i) => i + 2)), mon.weeks);
    check("周五那条是第 2,4,..,14 周（双周）", JSON.stringify(fri.weeks) === JSON.stringify([2, 4, 6, 8, 10, 12, 14]), fri.weeks);
    // 合起来 = 奇数周 1 节、偶数周 2 节
    const perWeek = {};
    [...mon.weeks, ...fri.weeks].forEach((w) => { perWeek[w] = (perWeek[w] || 0) + 1; });
    const oddWeeks = Object.entries(perWeek).filter(([w]) => Number(w) % 2 === 1);
    const evenWeeks = Object.entries(perWeek).filter(([w]) => Number(w) % 2 === 0);
    check("奇数周每周 1 节", oddWeeks.every(([, n]) => n === 1), oddWeeks);
    check("偶数周每周 2 节", evenWeeks.every(([, n]) => n === 2), evenWeeks);
  }

  // 名字清理
  const pe = rows.find((r) => r.course_name.includes("体育"));
  check("体育课名里的 <sup> 已清理", !!pe && !pe.course_name.includes("<") && pe.course_name.includes("篮球"), pe && pe.course_name);
  check("体育课空教室已处理", !!pe && pe.room === "", pe && pe.room);

  // 分组
  const { backup, report } = parser.rowsToBackup(rows);
  check("生成 12 门课程（按课名合并）", backup.courses.length === 12, backup.courses.length);
  check("生成 39 条日程", backup.schedules.length === 39, backup.schedules.length);
  check("数据库原理只有一门（不是 11 门）", backup.courses.filter((c) => c.name === "数据库原理").length === 1);
  check("最大节次是 11", report.maxPeriod === 11, report.maxPeriod);
  check("多教室/多教师都进了报告", report.notes.length >= 3, report.notes.length);
  check("每条日程都能对应到课程", backup.schedules.every((s) => backup.courses.some((c) => c.id === s.courseId)));
  check("weekType 只在 all/odd/even 内", backup.schedules.every((s) => ["all", "odd", "even"].includes(s.weekType)));
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
