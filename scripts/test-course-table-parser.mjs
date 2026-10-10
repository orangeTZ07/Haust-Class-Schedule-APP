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
// 下标即周次，跳过下标 0。0101 → 第 1、3 周。旧断言「第 2、4 周」是 i+1 的错位。
check("位串 0101 -> 第 1、3 周", JSON.stringify(parser.weeksFromBits("0101")) === "[1,3]", parser.weeksFromBits("0101"));
check("下标 0 即使是 1 也不算周", JSON.stringify(parser.weeksFromBits("1101")) === "[1,3]", parser.weeksFromBits("1101"));
check("不会产生第 0 周", !parser.weeksFromBits("1" + "0".repeat(52)).includes(0));
const weeks1to16 = Array.from({ length: 16 }, (_, i) => i + 1);
check(
  "53 位、前 16 周有课 -> 第 1-16 周",
  JSON.stringify(parser.weeksFromBits("0" + "1".repeat(16) + "0".repeat(36))) === JSON.stringify(weeks1to16)
);
const stamped = parser.rowsToBackup([{
  course_name: "高等数学",
  day_of_week: 1,
  start_unit: 1,
  end_unit: 2,
  weeks: [1, 2, 3],
  teacher: "张",
  room: "A101"
}]);
check("教务备份盖上来源", stamped.backup.schedules.every((s) => s.source === "eams"));
check("教务备份盖上当前 parserVersion", stamped.backup.schedules.every((s) => s.parserVersion === parser.EAMS_PARSER_VERSION), stamped.backup.schedules[0]);
check("第 1-3 周不再被写成第 2-4 周", stamped.backup.schedules[0].startWeek === 1 && stamped.backup.schedules[0].endWeek === 3);
check("单行也把教室写到课段上", stamped.backup.schedules[0].location === "A101", stamped.backup.schedules[0]);
check("空教室不写 location（留给课程那一列兜底）", parser.rowsToBackup([{
  course_name: "体育（3）篮球",
  day_of_week: 2,
  start_unit: 7,
  end_unit: 8,
  weeks: [1, 2],
  teacher: "冯",
  room: ""
}]).backup.schedules[0].location === undefined);

// 同一门课、两个教室：以前课程上只能留"出现最多的那个"，所有课段一起显示它（线上就是这么错的）。
const twoRooms = parser.rowsToBackup([
  { course_name: "数据库原理", day_of_week: 3, start_unit: 1, end_unit: 2, weeks: [7, 8], teacher: "范", room: "工科4-206" },
  { course_name: "数据库原理", day_of_week: 2, start_unit: 3, end_unit: 4, weeks: [7, 8], teacher: "范", room: "工科4-206" },
  { course_name: "数据库原理", day_of_week: 5, start_unit: 5, end_unit: 6, weeks: [7, 8], teacher: "范", room: "公教1-505" }
]);
const schedOn = (day) => twoRooms.backup.schedules.find((s) => s.dayOfWeek === day);
check("周三那条带自己那一行的教室", schedOn(3)?.location === "工科4-206", schedOn(3));
check("周五那条带自己那一行的教室（不再跟着周三）", schedOn(5)?.location === "公教1-505", schedOn(5));
check("课程上仍留出现次数最多的那个（给课程列表用）", twoRooms.backup.courses[0].location === "工科4-206", twoRooms.backup.courses[0]);
check("一门课仍然只有一条课程记录（没有按教室拆开）", twoRooms.backup.courses.length === 1);

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

  // 周次。下标即周次、跳过下标 0。
  // 旧断言写成「周一第 2-14 周、周五双周、奇数周 1 节」，那是 i+1 把整张课表推后一周之后的读数。
  const rawBits = parser.taskActivityWeekBits(html);
  check("真实响应每条位串下标 0 都是 0", rawBits.length > 0 && rawBits.every((bits) => bits[0] === "0"), rawBits.map((bits) => bits[0]));

  const mon = linAlg.find((r) => r.day_of_week === 1);
  const fri = linAlg.find((r) => r.day_of_week === 5);
  check("线性代数B 有周一那条", !!mon);
  check("线性代数B 有周五那条", !!fri);
  if (mon && fri) {
    check("周一那条是连续第 1-13 周", JSON.stringify(mon.weeks) === JSON.stringify([...Array(13)].map((_, i) => i + 1)), mon.weeks);
    check("周五那条是第 1,3,..,13 周", JSON.stringify(fri.weeks) === JSON.stringify([1, 3, 5, 7, 9, 11, 13]), fri.weeks);
    const perWeek = {};
    [...mon.weeks, ...fri.weeks].forEach((w) => { perWeek[w] = (perWeek[w] || 0) + 1; });
    const oddWeeks = Object.entries(perWeek).filter(([w]) => Number(w) % 2 === 1);
    const evenWeeks = Object.entries(perWeek).filter(([w]) => Number(w) % 2 === 0);
    check("奇数周每周 2 节", oddWeeks.every(([, n]) => n === 2), oddWeeks);
    check("偶数周每周 1 节", evenWeeks.every(([, n]) => n === 1), evenWeeks);
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
  check("真实课表的课段带来源与 parserVersion", backup.schedules.every((s) => s.source === "eams" && s.parserVersion === parser.EAMS_PARSER_VERSION));

  // 教室不再被打包：真实响应里 数据库原理 的 11 条活动散在 10 个教室。逐条写进课段后，
  // 课段上的教室集合应当**等于**原始行的教室集合 —— 这一条以前只会剩下一个。
  const courseNameOf = (schedule) => backup.courses.find((course) => course.id === schedule.courseId)?.name;
  const scheduleRooms = (name) => new Set(backup.schedules.filter((s) => courseNameOf(s) === name).map((s) => s.location).filter(Boolean));
  const rowRooms = (name) => new Set(rows.filter((r) => r.course_name === name && r.room).map((r) => r.room));

  for (const name of ["数据库原理", "前端开发技术"]) {
    const fromSchedules = scheduleRooms(name);
    const fromRows = rowRooms(name);
    check(`「${name}」原始行里的每个教室都还在课段上`, fromSchedules.size === fromRows.size && [...fromRows].every((room) => fromSchedules.has(room)),
      { fromSchedules: [...fromSchedules], fromRows: [...fromRows] });
    check(`「${name}」不再是"每门课一个教室"`, fromSchedules.size > 1, fromSchedules.size);
    check(`「${name}」课程上仍只留一个地点`, new Set(backup.courses.filter((c) => c.name === name).map((c) => c.location)).size === 1);
  }
}

// ---------- C. 公开的真实 TaskActivity（仓库里这份没有个人信息以外的河科大课表）----------
console.log("");
console.log("=== C. 公开 EAMS 样本（位串下标 0）===");
{
  const samplePath = join(here, "fixtures", "eams-npu-public-sample.html");
  const sample = readFileSync(samplePath, "utf8");
  const bits = parser.taskActivityWeekBits(sample);
  check("样本解析出 4 条位串", bits.length === 4, bits.length);
  check("样本位串都是 53 位", bits.every((item) => item.length === 53), bits.map((item) => item.length));
  check("样本每条下标 0 都是 0", bits.every((item) => item[0] === "0"), bits.map((item) => item[0]));
  check("样本没有第 0 周", bits.every((item) => !parser.weeksFromBits(item).includes(0)));
  // 离散数学第一条：下标 1..16 为 1 → 第 1–16 周。旧实现会把它存成第 2–17 周。
  check(
    "离散数学第一条是第 1-16 周",
    JSON.stringify(parser.weeksFromBits(bits[1])) === JSON.stringify(Array.from({ length: 16 }, (_, i) => i + 1)),
    parser.weeksFromBits(bits[1])
  );
  const { rows, problems } = parser.parseCourseTable(sample);
  check("样本能解析且没有失败项", rows.length === 4 && problems.length === 0, { rows: rows.length, problems });
  check("样本第 1 周不是空的", rows.some((row) => row.weeks.includes(1)));
}

// ---------- D. 截图对上的三格：第 6 周有，第 5 周没有 ----------
// 带背景的深色「课程表」是 Haust 应用。应用第 6 周这三格是空的，应用第 7 周
// （顶栏「第 7 周」，日期 10-12–18）这三门课在同样的格子里。
// 教务课表查询第 6 周有它们，第 5 周没有。旧解析把下标 6 存成第 7 周。
// 必测：这份课表 HTML 解析后，《数据库开发技术》的 startWeek === 6。
// 已经能对上的第 6 周格子是跨周课（第 5 周和第 6 周都有），修正后第 6 周仍包含它们。
console.log("");
console.log("=== D. 第 6 周三格归位，第 5 周仍空 ===");
{
  const fixturePath = join(here, "..", "tests", "fixtures", "eams-database-dev-tech.html");
  const html = readFileSync(fixturePath, "utf8");
  const bits = parser.taskActivityWeekBits(html);
  check("夹具有三条位串", bits.length === 3, bits.length);
  check("位串都是 53 位且下标 0 是 0", bits.every((item) => item.length === 53 && item[0] === "0"), bits.map((item) => item.length));
  const policyBits = bits[0] ?? "";
  check(
    "形势与政策：下标 5 无课，下标 6 和 7 有课",
    policyBits[5] === "0" && policyBits[6] === "1" && policyBits[7] === "1",
    policyBits.slice(0, 8)
  );
  const dbBits = bits.filter((item) => item.indexOf("1") === 6 && item[16] === "1");
  check("数据库开发技术两条位串的第一位有课在下标 6", dbBits.length === 2, bits.map((item) => item.indexOf("1")));
  check(
    "数据库开发技术解析为第 6–16 周，不含第 5 周",
    dbBits.every((item) => {
      const weeks = parser.weeksFromBits(item);
      return weeks.includes(6) && !weeks.includes(5) && weeks.at(-1) === 16;
    })
  );

  const { rows, problems } = parser.parseCourseTable(html);
  check("三条活动都能解析", rows.length === 3 && problems.length === 0, { rows: rows.length, problems });
  const { backup } = parser.rowsToBackup(rows);
  const named = (schedule) => backup.courses.find((course) => course.id === schedule.courseId)?.name;
  const slot = (name, day, start, end) =>
    backup.schedules.find((item) =>
      named(item) === name && item.dayOfWeek === day && item.startPeriod === start && item.endPeriod === end
    );
  const covers = (schedule, week) =>
    !!schedule &&
    schedule.startWeek <= week &&
    schedule.endWeek >= week &&
    (schedule.weekType === "all" || (schedule.weekType === "odd" ? week % 2 === 1 : week % 2 === 0));

  const policy = slot("形势与政策(2)", 2, 7, 8);
  const dbWed = slot("数据库开发技术", 3, 5, 6);
  const dbFri = slot("数据库开发技术", 5, 7, 8);
  const three = [policy, dbWed, dbFri];
  check("周二 7-8 是《形势与政策(2)》", !!policy, policy);
  check("周三 5-6 是《数据库开发技术》", !!dbWed, dbWed);
  check("周五 7-8 是《数据库开发技术》", !!dbFri, dbFri);
  check("数据库开发技术 startWeek === 6 且到第 16 周", dbWed?.startWeek === 6 && dbWed?.endWeek === 16 && dbFri?.startWeek === 6 && dbFri?.endWeek === 16, [dbWed, dbFri]);
  check("第 6 周这三格都有课", three.every((item) => covers(item, 6)), three);
  check("第 5 周这三格都是空的", three.every((item) => !covers(item, 5)), three);
  check("形势与政策第 7 周仍有课", covers(policy, 7), policy);
  check("带来源与 parserVersion", three.every((item) => item?.source === "eams" && item?.parserVersion === parser.EAMS_PARSER_VERSION));

  const spanning = parser.weeksFromBits("0" + "1".repeat(16) + "0".repeat(36));
  check(
    "第 1–16 周的课修正后第 6 周仍在",
    spanning[0] === 1 && spanning.includes(5) && spanning.includes(6),
    spanning
  );
}

// ---------- D. 接线（读源码）：地点从数据库到卡片到导出，哪一环漏了都白改 ----------
console.log("");
console.log("=== D. 接线（读源码）===");
{
  const svc = readFileSync(join(here, "..", "src", "services", "courseService.ts"), "utf8");
  check("schedules 加 location 列（PRAGMA 守卫的迁移）",
    svc.includes("ALTER TABLE schedules ADD COLUMN location TEXT") && svc.includes('column.name === "location"'));
  check("从库里读回来时映射 location", svc.includes("location: typeof row.location === \"string\""));
  check("新增课段把 location 写进库", /INSERT INTO schedules \(course_id[\s\S]{0,160}location\)/.test(svc));
  check("更新课段把 location 写进库", /UPDATE schedules SET[\s\S]{0,320}location = \$12/.test(svc));
  check("撤销/重做整表写回也带 location（少这一列 = 按一次撤销就抹掉所有地点）",
    /INSERT INTO schedules \(id, course_id[\s\S]{0,160}location\)/.test(svc));

  const block = readFileSync(join(here, "..", "src", "components", "timetable", "CourseBlock.vue"), "utf8");
  check("卡片显示时课段地点优先", block.includes("props.schedule.location || props.course.location"));

  const courses = readFileSync(join(here, "..", "src", "composables", "useCourses.ts"), "utf8");
  check("CSV 导出写课段的地点", courses.includes('schedule.location || course.location || ""'));
  check("备份导入恢复课段地点", courses.includes("location: schedule.location"));
  check("整学期改地点时清掉课段自带的地点（卡片课段优先，不清就等于编辑没生效）",
    courses.includes("{ ...row, location: undefined }"));
  check("拖动改时间时把原课段的地点带走", courses.includes("location: current.location"));

  const eams = readFileSync(join(here, "..", "src", "components", "course", "import", "EamsSyncSection.vue"), "utf8");
  check("导入报告里的 notes 真的显示出来了", eams.includes("result.report.notes") && /notes\.slice\(0, NOTES_SHOWN\)/.test(eams));
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
