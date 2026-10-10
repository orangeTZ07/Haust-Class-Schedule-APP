// 教务系统（EAMS）课表解析 —— 应用与命令行脚本共用的唯一实现。
//
// 解析规则全部来自真实响应，并经过验证，不是推测：
//
//   1. 每条课是 `new TaskActivity(...)`，14 个参数：
//        [ 3] 课程名  [ 5] 教室  [ 6] 周次位串  [12][13] 起止节次
//   2. **星期不在参数里**，而在紧随其后的 `index = N * unitCount + M`：
//        N 是星期（0 起算，0=周一），M 是当天第几节。
//      页面自身结构印证了这一点：unitCount = 14，且 table0 = new CourseTable(2026, 98)，
//      7 天 × 14 节 = 98，正好是 N∈0..6、M∈0..13 能覆盖的下标范围。
//   3. 周次位串**一个字符一位**，长度通常是 53（尾部用 0 补到学期之外）。
//      **下标 0 是占位，不代表某一周**（公开的教务响应里这一位恒为 '0'），下标 i（i ≥ 1）
//      就是第 i 周。不要写成 i+1：那样会把第 1–16 周存成第 2–17 周，第 1 周整周空表，
//      「当前所处周」相对课程也会整周偏后。旧注释曾用「线性代数B 周一第 2..14 周」当佐证，
//      那个读数本身就是 i+1 的错位，不是校历。
//   4. 教师姓名不在参数里（那里是 actTeacherName.join(',')），来自**之后**的
//      `var teachers = [{name:"..."}]`。
//
//      **不要改成往前取。** 活动之前的那个 `var teachers` 属于**上一条**活动（它被用来构造
//      actTeacherName），所以往前取会把教师整体错位一位。实测：33 条里 18 条前后不一致，
//      往前取会写错 18 位教师 —— 而取错教师比取不到更糟，因为它看起来是正常的。
//
//      代价是脚本里的**最后一条**活动后面没有这一行（实测 33/34 条有）。那一条的教师为空，
//      由分组时的"出现次数最多"兜住；如果一门课只有这一条活动，它就没有教师了。
//
// 这个文件刻意不引入任何 Node/浏览器 API：它只接收字符串、返回数据，所以应用和命令行
// 能跑同一份代码。两份实现必然漂移，而漂移出来的课表错误是最难发现的那种。
//
// 另外注意一个**必须避免的坑**：semester.id 绝不能写死。传一个不存在的学期，服务器会走进
// "提示用户选择学期"的分支，而那套模板在这套部署里是坏的，返回一个毫无线索的 HTTP 500。
// 所以 semesterId 一律从课表页现场解析（extractCoursePageParams）。

export interface CourseRow {
  course_name: string;
  teacher: string;
  room: string;
  weeks: number[];
  day_of_week: number;
  start_unit: number;
  end_unit: number;
}

export interface BackupSchedule {
  id: number;
  courseId: number;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  startWeek: number;
  endWeek: number;
  weekType: "all" | "odd" | "even";
  scope: "semester";
  /// 这一条课段自己的教室（来自它那一行）。同一门课换教室时，各条课段各带各的。
  location?: string;
  /// 教务导入才有。旧备份和手填课没有这两项，不能靠它们反推来源。
  source?: "eams";
  /// 写出这份周次时的解析规则。2 = 下标即周次、跳过下标 0；3 = 教室写到课段上。
  parserVersion?: number;
}

export interface BackupCourse {
  id: number;
  name: string;
  teacher?: string;
  location?: string;
}

export interface Backup {
  exportedAt: string;
  activeCourseTableId: number;
  currentWeek: number;
  courses: BackupCourse[];
  schedules: BackupSchedule[];
}

export interface ConvertReport {
  rows: number;
  courses: number;
  schedules: number;
  skippedNoDay: number;
  skippedBadPeriod: number;
  maxPeriod: number;
  problems: string[];
  notes: string[];
}

export interface ParsedCoursePage {
  ids: string;
  semesterId: string;
  projectId: string;
}

/// 应用里 addSchedule 的默认学期跨度，周次缺失时按整学期兜底。
const DEFAULT_END_WEEK = 20;

/// 解析器的写入版本。存进每条课段，以后规则再变才能只改来自这一版的数据。
/// 2：下标即周次，跳过下标 0。没有 1 —— 1 就是已经写进用户课表、无法区分来源的那次 i+1 错位。
/// 3：每一行的教室写进它自己那条课段（2 只会把一门课的教室压成一个）。
export const EAMS_PARSER_VERSION = 3;

const WEEKDAY_INDEX_RE = /index\s*=\s*(\d+)\s*\*\s*unitCount/;
const TEACHERS_RE = /var\s+teachers\s*=\s*(\[[\s\S]*?\])\s*;?/;
const TASK_ACTIVITY_RE = /new\s+TaskActivity\s*\(([\s\S]*?)\)\s*;/g;

/// 按引号规则切分参数 —— 教室名里出现逗号是常态，简单 split(',') 会切错。
export const splitActivityArgs = (text: string): string[] => {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") { current += ch + (text[++i] ?? ""); continue; }
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === ",") { out.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
};

const unquote = (value: string | undefined): string => {
  const text = (value ?? "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
};

/// 去掉 (rjxy_1012049.001) 这类课程代码，并把 <sup> 标签还原成文字。
/// 体育课的真实名字是「体育（3）<sup style='...'>篮球</sup>」，留着标签会显示成乱码。
export const cleanCourseName = (raw: string): string =>
  raw
    .replace(/<sup[^>]*>/gi, "")
    .replace(/<\/sup>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\([a-z]+_\d+\.\d+\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

/// 位串按周计：下标就是周次。下标 0 是占位，即使偶发为 '1' 也不算某一周。
export const weeksFromBits = (bits: string): number[] =>
  [...bits].reduce<number[]>((acc, ch, i) => (i > 0 && ch === "1" ? acc.concat(i) : acc), []);

/// 每条 TaskActivity 的周次位串原文，给测试核对「下标 0 是不是 0」。解析课表本身用不到。
export const taskActivityWeekBits = (html: string): string[] => {
  const bits: string[] = [];
  TASK_ACTIVITY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TASK_ACTIVITY_RE.exec(html)) !== null) {
    const args = splitActivityArgs(match[1]);
    if (args.length >= 7) bits.push(unquote(args[6]));
  }
  return bits;
};

/// 从 courseTableForStd.action 页面里取随请求提交的三个参数。
///
/// ids 在 searchTable() 的 `bg.form.addInput(form,"ids","NNN")` 里；学生课表分支排在前面，
/// 所以第一个就是 setting.kind=std 要用的那个。
export const extractCoursePageParams = (page: string): ParsedCoursePage | null => {
  const idsAll = [...page.matchAll(/addInput\(\s*form\s*,\s*["']ids["']\s*,\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const semester = page.match(/semesterCalendar\([^)]*?value\s*:\s*["']?(\d+)["']?/);
  const project = page.match(/semesterBar(\d{6,})Semester/);

  if (!idsAll.length || !semester) return null;

  return {
    ids: idsAll[0],
    semesterId: semester[1],
    projectId: project ? project[1] : ""
  };
};

/// HTML → 中立课程行。这一层只做"读懂页面"，不涉及应用的存储格式。
export const parseCourseTable = (html: string): { rows: CourseRow[]; problems: string[] } => {
  const rows: CourseRow[] = [];
  const problems: string[] = [];

  TASK_ACTIVITY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = TASK_ACTIVITY_RE.exec(html)) !== null) {
    index += 1;
    const args = splitActivityArgs(match[1]);
    const after = html.slice(match.index + match[0].length, match.index + match[0].length + 700);

    if (args.length < 14) {
      problems.push(`第 ${index} 条只有 ${args.length} 个参数（期望 14），已跳过`);
      continue;
    }

    const dayMatch = after.match(WEEKDAY_INDEX_RE);
    if (!dayMatch) {
      problems.push(`第 ${index} 条（${cleanCourseName(unquote(args[3])) || "未命名"}）找不到 index = N*unitCount，已跳过`);
      continue;
    }
    const day = parseInt(dayMatch[1], 10) + 1; // 页面 0 起算，应用 1=周一
    if (day < 1 || day > 7) {
      problems.push(`第 ${index} 条星期解析为 ${day}（超出 1-7），已跳过`);
      continue;
    }

    const teacherMatch = after.match(TEACHERS_RE);
    let teacher = "";
    if (teacherMatch) {
      teacher = [...teacherMatch[1].matchAll(/name\s*:\s*["']([^"']*)["']/g)]
        .map((x) => x[1].trim())
        .filter(Boolean)
        .join("、");
    }

    const startUnit = parseInt(unquote(args[12]), 10);
    const endUnit = parseInt(unquote(args[13]), 10);
    if (!Number.isInteger(startUnit) || !Number.isInteger(endUnit)) {
      problems.push(`第 ${index} 条节次不是数字（${unquote(args[12])}/${unquote(args[13])}），已跳过`);
      continue;
    }

    rows.push({
      course_name: cleanCourseName(unquote(args[3])),
      teacher,
      room: unquote(args[5]).trim(),
      weeks: weeksFromBits(unquote(args[6])),
      day_of_week: day,
      start_unit: startUnit,
      end_unit: endUnit
    });
  }

  return { rows, problems };
};

/// 把升序周次切成连续段：[1,2,3,6,7] → [[1,2,3],[6,7]]
const toRuns = (sortedWeeks: number[]): number[][] => {
  const runs: number[][] = [];
  let run: number[] = [];
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

/// 周次列表 → 尽量少的周次范围。
///
/// 优先用一条表达：整体连续就是 all，正好是区间内的奇数/偶数就是 odd/even —— 应用侧
/// isScheduleActiveInWeek 本来就按单双周过滤，所以 [1,3,5,7,9] 写成 odd 比拆成五条更准也更轻。
/// 只有真的不属于以上任何一种（例如 [3,4,5,6,9]）才退回按连续段拆开，每条都是 all。
export const toWeekSpans = (weeks: number[]): Array<{
  startWeek: number; endWeek: number; weekType: "all" | "odd" | "even"; approximated?: boolean;
}> => {
  const sorted = [...new Set(weeks)].filter((w) => Number.isInteger(w) && w > 0).sort((a, b) => a - b);

  if (sorted.length === 0) {
    return [{ startWeek: 1, endWeek: DEFAULT_END_WEEK, weekType: "all", approximated: true }];
  }

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const span: number[] = [];
  for (let week = min; week <= max; week++) span.push(week);

  if (sorted.length === span.length) {
    return [{ startWeek: min, endWeek: max, weekType: "all" }];
  }

  const odds = span.filter((w) => w % 2 === 1);
  const evens = span.filter((w) => w % 2 === 0);
  const equals = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

  if (equals(sorted, odds)) return [{ startWeek: min, endWeek: max, weekType: "odd" }];
  if (equals(sorted, evens)) return [{ startWeek: min, endWeek: max, weekType: "even" }];

  return toRuns(sorted).map((run) => ({
    startWeek: run[0],
    endWeek: run[run.length - 1],
    weekType: "all" as const
  }));
};

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const asPeriod = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null;
};

/// 中立课程行 → 应用可恢复的备份格式。
///
/// **只按课名分组**，教室和教师都不进分组键，两个理由都来自真实数据：
///   1. 教室：数据库原理有 11 条活动、散在 10 个教室，按教室分组会让它变成 11 门同名课。
///   2. 教师：同一门课的不同活动本来就可能挂不同教师，那门课挂了 6 位，按教师会变成 6 门。
///
/// 分组仍然只按课名，但**地点不再被压成一个**：每一行的教室写进它自己那条课段
/// （CourseSchedule.location），课程上留的是出现次数最多的那个，只用于课程列表显示、
/// 以及给老数据 / 手填课的课段兜底。所以「数据库原理 周三 4-206、周五 公教1-505」两格
/// 现在各显示各的 —— 这一条以前是丢掉的。
///
/// 教师仍然是「取出现次数最多的那个」（teacher 只在课程上，没有课段级教师），这一项的分歧
/// 照旧写进报告：它仍然是丢信息，只是比把一门课拆成六门好。
export const rowsToBackup = (rows: unknown[]): { backup: Backup; report: ConvertReport } => {
  const problems: string[] = [];
  const notes: string[] = [];

  if (!Array.isArray(rows)) {
    throw new Error("输入必须是数组");
  }

  interface Group { name: string; teachers: Map<string, number>; rooms: Map<string, number>; rows: Array<{ day: number; start: number; end: number; weeks: unknown; room: string }> }
  const groups = new Map<string, Group>();
  let skippedNoDay = 0;
  let skippedBadPeriod = 0;
  let maxPeriod = 0;

  rows.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      problems.push(`第 ${index + 1} 条不是对象，已跳过`);
      return;
    }
    const row = raw as Record<string, unknown>;

    const day = Number(row.day_of_week);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      // 星期解析不出来时宁可丢掉并报出来，也不要瞎猜 —— 猜错会变成"课表看着正常但排错日子"。
      skippedNoDay++;
      problems.push(`「${asText(row.course_name) || "未命名"}」星期无法解析（day_of_week=${JSON.stringify(row.day_of_week)}），已跳过`);
      return;
    }

    const start = asPeriod(row.start_unit);
    if (start === null) {
      skippedBadPeriod++;
      problems.push(`「${asText(row.course_name) || "未命名"}」节次不合法（start_unit=${JSON.stringify(row.start_unit)}），已跳过`);
      return;
    }
    // 先确认 start 有效再算 end，这样 end 一定不是 null（也让类型收窄成立）。
    const end = asPeriod(row.end_unit) ?? start;

    maxPeriod = Math.max(maxPeriod, start, end);

    const name = asText(row.course_name) || "未命名课程";
    const teacher = asText(row.teacher);
    const room = asText(row.room);

    if (!groups.has(name)) groups.set(name, { name, teachers: new Map(), rooms: new Map(), rows: [] });
    const group = groups.get(name)!;
    if (teacher) group.teachers.set(teacher, (group.teachers.get(teacher) ?? 0) + 1);
    if (room) group.rooms.set(room, (group.rooms.get(room) ?? 0) + 1);
    // room 跟着这一行走：投票用的 group.rooms 只统计次数，教室本身要写进课段。
    group.rows.push({ day, start, end, weeks: row.weeks, room });
  });

  const courses: BackupCourse[] = [];
  const schedules: BackupSchedule[] = [];
  let nextCourseId = 1;
  let nextScheduleId = 1;

  // 出现次数最多的值；平手时取名字排序靠前的，保证同样的输入总是得到同样的输出。
  const rank = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  for (const group of groups.values()) {
    const courseId = nextCourseId++;
    const rankedRooms = rank(group.rooms);
    const rankedTeachers = rank(group.teachers);
    const primaryRoom = rankedRooms.length ? rankedRooms[0][0] : "";
    const primaryTeacher = rankedTeachers.length ? rankedTeachers[0][0] : "";

    if (rankedRooms.length > 1) {
      notes.push(`「${group.name}」在 ${rankedRooms.length} 个教室上过课（${rankedRooms.map(([r, n]) => `${r}×${n}`).join("、")}）：每节课按各自的教室显示，课程列表里显示出现最多的「${primaryRoom}」。`);
    }
    if (rankedTeachers.length > 1) {
      notes.push(`「${group.name}」有 ${rankedTeachers.length} 位教师（${rankedTeachers.map(([t, n]) => `${t}×${n}`).join("、")}），教师取了最多的「${primaryTeacher}」。`);
    }

    courses.push({
      id: courseId,
      name: group.name,
      teacher: primaryTeacher || undefined,
      location: primaryRoom || undefined
      // 不给 color：留空时应用会按调色板自动分配。
    });

    for (const row of group.rows) {
      const spans = toWeekSpans(Array.isArray(row.weeks) ? (row.weeks as number[]) : []);
      for (const span of spans) {
        if (span.approximated) notes.push(`「${group.name}」缺少周次信息，已按第 1-${DEFAULT_END_WEEK} 周处理`);
        schedules.push({
          id: nextScheduleId++,
          courseId,
          dayOfWeek: row.day,
          // 应用的 endPeriod 是包含的，爬虫的"第1-2节"同样是包含语义，所以直接照搬。
          startPeriod: row.start,
          endPeriod: row.end,
          startWeek: span.startWeek,
          endWeek: span.endWeek,
          weekType: span.weekType,
          scope: "semester",
          // 这一行自己的教室。上面那个 primaryRoom 只是课程的"门面"，不写下来就等于把
          // 换教室的细节丢了 —— 那正是这一列存在的理由。
          location: row.room || undefined,
          source: "eams",
          parserVersion: EAMS_PARSER_VERSION
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
