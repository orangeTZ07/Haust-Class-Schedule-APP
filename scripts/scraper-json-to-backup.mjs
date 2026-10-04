#!/usr/bin/env node
//
// haust_spider.py 的输出 → 本应用能恢复的备份格式。
//
// 为什么需要这一层：爬虫的输出喂不进应用。
//
//   { "teacher", "course_name", "room", "weeks":[3,4,5,6,9], "day_of_week", "start_unit", "end_unit" }
//
// 而应用的「按周/按学期导入」要求 { "name", "day", "periods":"1-2", "loc", "teacher" }：键名不同，
// 而且那条路径**完全不支持周次** —— 它调 addSchedule 时用默认的 startWeek=1 / endWeek=20，
// 于是 weeks 会被整个丢掉，课会在每一周都显示。
//
// 所以目标格式是「完整 JSON 备份」，它带 startWeek / endWeek / weekType，能无损表达周次。
//
// 用法：
//   node scripts/scraper-json-to-backup.mjs courses.json            # 输出到 stdout
//   node scripts/scraper-json-to-backup.mjs courses.json -o bak.json
//   node scripts/scraper-json-to-backup.mjs -o bak.json < courses.json
//
// 报告走 stderr，数据走 stdout，所以可以直接重定向。

import { readFileSync, writeFileSync } from "node:fs";

/// 应用里 CourseSchedule 的字段名，以及默认学期跨度（与 useCourses.addSchedule 的默认值一致）。
const DEFAULT_END_WEEK = 20;
/// 应用默认配置是 10 节；超出会渲染不出来，所以单独提醒。
const DEFAULT_PERIOD_COUNT = 10;

/// 把升序的周次切成连续段：[1,2,3,6,7] → [[1,2,3],[6,7]]
const toRuns = (sortedWeeks) => {
  const runs = [];
  let run = [];
  for (const week of sortedWeeks) {
    if (run.length && week !== run[run.length - 1] + 1) {
      runs.push(run);
      run = [];
    }
    run.push(week);
  }
  if (run.length) runs.push(run);
  return runs;
};

/// 周次列表 → 若干条日程的周次范围。
///
/// 优先用**一条**日程表达：整体连续就是 all，正好是区间内的奇数/偶数就是 odd/even —— 应用侧
/// isScheduleActiveInWeek 本来就按单双周过滤，所以 [1,3,5,7,9] 写成 odd 比拆成五条更准确也更轻。
/// 只有真的不属于以上任何一种（例如 [3,4,5,6,9]）才退回按连续段拆开，每条都是 all。
const toWeekSpans = (weeks) => {
  const sorted = [...new Set(weeks)]
    .filter((week) => Number.isInteger(week) && week > 0)
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    // 爬虫没给周次（例如星期都没解析出来）时按整学期处理，而不是让这条课程消失。
    return [{ startWeek: 1, endWeek: DEFAULT_END_WEEK, weekType: "all", approximated: true }];
  }

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const span = [];
  for (let week = min; week <= max; week++) span.push(week);

  if (sorted.length === span.length) {
    return [{ startWeek: min, endWeek: max, weekType: "all" }];
  }

  const odds = span.filter((week) => week % 2 === 1);
  const evens = span.filter((week) => week % 2 === 0);
  const equals = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

  if (equals(sorted, odds)) {
    return [{ startWeek: min, endWeek: max, weekType: "odd" }];
  }
  if (equals(sorted, evens)) {
    return [{ startWeek: min, endWeek: max, weekType: "even" }];
  }

  return toRuns(sorted).map((run) => ({
    startWeek: run[0],
    endWeek: run[run.length - 1],
    weekType: "all"
  }));
};

const asText = (value) => (typeof value === "string" ? value.trim() : "");

const asPeriod = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null;
};

const convert = (rows) => {
  const problems = [];
  const notes = [];

  if (!Array.isArray(rows)) {
    throw new Error("输入必须是数组：爬虫输出的顶层就是一个课程活动数组");
  }

  /// 按「课程名 + 教师 + 教室」归组。
  ///
  /// 教室之所以进入分组键：应用的数据模型里 location 挂在 Course 上而不是日程上，所以同一门课
  /// 换教室时无法在一条课程里表达。拆成同名课程能保住每个教室，代价是列表里会看到重复的课名。
  /// 这是模型的取舍，不是爬虫的问题，所以在报告里说明。
  const groups = new Map();
  let skippedNoDay = 0;
  let skippedBadPeriod = 0;
  let maxPeriod = 0;

  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      problems.push(`第 ${index + 1} 条不是对象，已跳过`);
      return;
    }

    const day = Number(row.day_of_week);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      // 星期解析不出来时宁可丢掉并报出来，也不要瞎猜 —— 猜错会变成"课表看着正常但排错日子"。
      skippedNoDay++;
      problems.push(`「${asText(row.course_name) || "未命名"}」星期无法解析（day_of_week=${JSON.stringify(row.day_of_week)}），已跳过`);
      return;
    }

    const start = asPeriod(row.start_unit);
    const end = asPeriod(row.end_unit) ?? start;
    if (start === null) {
      skippedBadPeriod++;
      problems.push(`「${asText(row.course_name) || "未命名"}」节次不合法（start_unit=${JSON.stringify(row.start_unit)}），已跳过`);
      return;
    }

    maxPeriod = Math.max(maxPeriod, start, end);

    const name = asText(row.course_name) || "未命名课程";
    const teacher = asText(row.teacher);
    const room = asText(row.room);

    // 只按**课名**分组。教室和教师都不进分组键，两个原因都来自真实数据：
    //
    //   1. 教室：数据库原理有 11 条活动、散在 10 个教室；按教室分组会让它变成 11 门同名课。
    //   2. 教师：同一门课的不同活动本来就可能挂不同教师（不同周次/教室由不同老师上）。
    //      数据库原理的 11 条活动挂了 6 位教师，按教师分组会变成 6 门。
    //
    // 应用的数据模型里 location 和 teacher 都挂在 Course 上、日程上没有，所以这两项只能各取
    // 一个代表值。取"出现次数最多的"，并在报告里说明有分歧的课 —— 丢掉换教室/换老师的细节，
    // 也远好过把一门课变成十几门。
    const key = name;

    if (!groups.has(key)) groups.set(key, { name, teachers: new Map(), rooms: new Map(), rows: [] });
    const group = groups.get(key);
    if (teacher) group.teachers.set(teacher, (group.teachers.get(teacher) ?? 0) + 1);
    if (room) group.rooms.set(room, (group.rooms.get(room) ?? 0) + 1);
    group.rows.push({ day, start, end, weeks: row.weeks });
  });

  const courses = [];
  const schedules = [];
  let nextCourseId = 1;
  let nextScheduleId = 1;

  for (const group of groups.values()) {
    const courseId = nextCourseId++;

    // 出现次数最多的教室/教师。平手时取名字排序靠前的，保证同样的输入总是得到同样的输出。
    const rank = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const rankedRooms = rank(group.rooms);
    const rankedTeachers = rank(group.teachers);
    const primaryRoom = rankedRooms.length ? rankedRooms[0][0] : "";
    const primaryTeacher = rankedTeachers.length ? rankedTeachers[0][0] : "";

    if (rankedRooms.length > 1) {
      notes.push(
        `「${group.name}」在 ${rankedRooms.length} 个教室上过课（${rankedRooms.map(([r, n]) => `${r}×${n}`).join("、")}），` +
        `地点取了最多的「${primaryRoom}」。`
      );
    }
    if (rankedTeachers.length > 1) {
      notes.push(
        `「${group.name}」有 ${rankedTeachers.length} 位教师（${rankedTeachers.map(([t, n]) => `${t}×${n}`).join("、")}），` +
        `教师取了最多的「${primaryTeacher}」。`
      );
    }

    courses.push({
      id: courseId,
      name: group.name,
      teacher: primaryTeacher || undefined,
      location: primaryRoom || undefined
      // 不给 color：留空时应用会按调色板自动分配，和手动导入的效果一致。
    });

    for (const row of group.rows) {
      const spans = toWeekSpans(Array.isArray(row.weeks) ? row.weeks : []);
      for (const span of spans) {
        if (span.approximated) {
          notes.push(`「${group.name}」缺少周次信息，已按第 1-${DEFAULT_END_WEEK} 周处理`);
        }
        schedules.push({
          id: nextScheduleId++,
          courseId,
          dayOfWeek: row.day,
          // 应用的 endPeriod 是**包含**的（WeekGrid 里 span = end - start + 1），爬虫的
          // "第1-2节" 同样是包含语义，所以直接照搬。
          startPeriod: row.start,
          endPeriod: row.end,
          startWeek: span.startWeek,
          endWeek: span.endWeek,
          weekType: span.weekType,
          scope: "semester"
        });
      }
    }
  }

  return {
    backup: {
      exportedAt: new Date().toISOString(),
      activeCourseTableId: 1,
      currentWeek: 1,
      courses,
      schedules
    },
    report: {
      rows: rows.length,
      courses: courses.length,
      schedules: schedules.length,
      skippedNoDay,
      skippedBadPeriod,
      maxPeriod,
      problems,
      notes
    }
  };
};

const main = () => {
  const args = process.argv.slice(2);
  let inputPath = "";
  let outputPath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--out") {
      outputPath = args[++i] ?? "";
    } else if (!inputPath) {
      inputPath = args[i];
    }
  }

  const raw = inputPath ? readFileSync(inputPath, "utf8") : readFileSync(0, "utf8");
  const rows = JSON.parse(raw);
  const { backup, report } = convert(rows);

  // 报告走 stderr，数据走 stdout，这样可以安全地重定向。
  const log = (line) => process.stderr.write(line + "\n");
  log(`输入 ${report.rows} 条活动 → ${report.courses} 门课程 / ${report.schedules} 条日程`);

  if (report.skippedNoDay > 0) {
    log(`跳过 ${report.skippedNoDay} 条：星期无法解析。这是爬虫最不可靠的一环，宁可漏也不要排错日子。`);
  }
  if (report.skippedBadPeriod > 0) {
    log(`跳过 ${report.skippedBadPeriod} 条：节次不合法。`);
  }
  report.notes.forEach((note) => log(`注意：${note}`));
  report.problems.slice(0, 20).forEach((problem) => log(`  - ${problem}`));
  if (report.problems.length > 20) {
    log(`  …另有 ${report.problems.length - 20} 条同类问题`);
  }

  if (report.maxPeriod > DEFAULT_PERIOD_COUNT) {
    log(
      `注意：课表里最大节次是第 ${report.maxPeriod} 节，而应用默认只显示 ${DEFAULT_PERIOD_COUNT} 节。` +
      `导入后请到 设置 → 网格设置 把节数调到至少 ${report.maxPeriod}，否则超出的课不会显示。`
    );
  }

  const json = JSON.stringify(backup, null, 2);
  if (outputPath) {
    writeFileSync(outputPath, json, "utf8");
    log(`已写入 ${outputPath}`);
  } else {
    process.stdout.write(json + "\n");
  }

  log("");
  log("下一步：打开应用 → 侧边栏「导入课表」→ 选「恢复备份」→ 粘贴这段 JSON → 确认恢复。");
  log("注意：「恢复备份」是整体替换，会清掉当前课表。");
};

main();
