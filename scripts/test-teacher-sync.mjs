// 一门课可能由不同教师授课，而课程上只存得下一个。这里用合成数据验证课段级教师。
//
// 这一组断言盯两件事：
// 1. 导入时每一行的老师必须写进课段（否则多教师课只能显示投票出来的那一位 = "名字对不上"）；
// 2. 所有"读教师"的地方必须课段优先，且写入路径（整学期/仅本周）不能漏清旧值。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const read = rel => readFileSync(join(root, rel), "utf8");

const sync = await loadTs(join(root, "src/utils/locationSync.ts"));
const label = await loadTs(join(root, "src/utils/teacherLabel.ts"));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const row = (over = {}) => ({
  id: 1, courseId: 9, dayOfWeek: 1, startPeriod: 1, endPeriod: 2,
  startWeek: 1, endWeek: 16, weekType: "all", scope: "semester", isCancelled: false,
  ...over
});

console.log("=== A. 课段级教师的清理规则 ===");
{
  const rows = [
    row({ id: 1, teacher: "甲" }),
    row({ id: 2, teacher: "乙", dayOfWeek: 3 }),
    row({ id: 3 }),                                  // 本来就没有课段级教师
    row({ id: 4, teacher: "丙", isCancelled: true }), // 停课，不参与显示
    row({ id: 5, teacher: "丁", courseId: 77 })      // 别的课
  ];
  const ids = sync.scheduleIdsWithOwnTeacher(rows, 9);
  check("只清这门课的课段", ids.every(id => [1, 2].includes(id)), ids);
  check("停课的课段跳过", !ids.includes(4), ids);
  check("没有课段级教师的不动", !ids.includes(3), ids);
  check("别的课不碰", !ids.includes(5), ids);
  check("地点版仍然可用（同一套实现）", sync.scheduleIdsWithOwnLocation(
    [row({ id: 1, location: "A101" }), row({ id: 2 })], 9
  ).join() === "1");
  check("有两个清理函数共享同一个实现", typeof sync.scheduleIdsWithOwnField === "function");
}

console.log("\n=== B. 仅本周：只清用户真的改了的字段 ===");
{
  const base = row({ id: 1, location: "旧教室", teacher: "旧老师", courseId: 3 });
  const onlyLocation = sync.patchWeeklyRowForOverlay(base, 55, 4, { location: true, teacher: false });
  check("只改地点时清掉课段地点", onlyLocation.location === undefined);
  check("只改地点时**保留**这一格自己的老师", onlyLocation.teacher === "旧老师");
  check("搬到覆盖层课程", onlyLocation.courseId === 55 && onlyLocation.endPeriod === 4);

  const onlyTeacher = sync.patchWeeklyRowForOverlay(base, 55, 4, { location: false, teacher: true });
  check("只改教师时清掉课段教师", onlyTeacher.teacher === undefined);
  check("只改教师时保留这一格的教室", onlyTeacher.location === "旧教室");

  const both = sync.patchWeeklyRowForOverlay(base, 55, 4, { location: true, teacher: true });
  check("两个都改就都清", both.location === undefined && both.teacher === undefined);

  const none = sync.patchWeeklyRowForOverlay(base, 55, 4, { location: false, teacher: false });
  check("都没改就都不动", none.location === "旧教室" && none.teacher === "旧老师");
}

console.log("\n=== C. 课程列表上的教师标签 ===");
{
  check("只有课程级教师时显示它", label.teacherLabel("范伊红", []) === "范伊红");
  check("一门课一个老师时显示那一个", label.teacherLabel("范伊红", ["范伊红", "范伊红"]) === "范伊红");
  check("多个老师显示「某 等 N 位」", label.teacherLabel("范伊红", ["范伊红", "李文汇", "叶传奇"]) === "范伊红 等 3 位", label.teacherLabel("范伊红", ["范伊红", "李文汇", "叶传奇"]));
  check("课程级教师不在课段里时用第一个", label.teacherLabel("张三", ["李四", "王五"]) === "李四 等 2 位", label.teacherLabel("张三", ["李四", "王五"]));
  check("课段没老师时回落课程级", label.teacherLabel("范伊红", [undefined, ""]) === "范伊红");
  check("全都没有时返回空串（模板 v-if 隐藏这一行）", label.teacherLabel(undefined, []) === "");
  check("去重后再计数", label.teacherLabel(undefined, ["甲", "甲", "乙"]) === "甲 等 2 位");
  check("忽略空白", label.teacherLabel(undefined, ["  ", "甲"]) === "甲");
  check("课段回落到课程教师后再汇总，不漏掉默认教师",
    label.teacherLabel("甲", [undefined, "乙"]) === "甲 等 2 位");
  check("所有课段都指定教师时，不把未参与授课的课程默认值算进去",
    label.teacherLabel("甲", ["乙", "丙"]) === "乙 等 2 位");
}

console.log("\n=== D. 导入：每一行的教师写进课段 ===");
{
  const parser = read("src/services/eams/courseTableParser.ts");
  check("课段行结构带 teacher", /interface Group \{[\s\S]{0,400}teacher: string/.test(parser), "rows 类型里没有 teacher");
  check("逐行 push 时带上这一行的老师", /group\.rows\.push\(\{[\s\S]{0,120}teacher \}\)/.test(parser), parser.match(/group\.rows\.push\([^\n]*/)?.[0]);
  check("写入课段时用 row.teacher（不是投票值）", parser.includes("teacher: row.teacher || undefined"), "课段没写自己的老师");
  check("课程级仍保留投票值（老数据/单教师课靠它）", parser.includes("teacher: primaryTeacher || undefined"));
  check("备份格式带课段教师", /export interface BackupSchedule \{[\s\S]{0,600}teacher\?: string/.test(parser), "BackupSchedule 没加 teacher");
}

console.log("\n=== E. 存储：列、迁移、三条写路径 ===");
{
  const service = read("src/services/courseService.ts");
  check("建表就有 teacher 列", /CREATE TABLE IF NOT EXISTS schedules[\s\S]{0,700}teacher TEXT/.test(service));
  check("老库补列（迁移）", /ALTER TABLE schedules ADD COLUMN teacher TEXT/.test(service));
  check("读取时把 teacher 映射进来", service.includes('teacher: typeof row.teacher === "string" && row.teacher'));
  check("冗余收拢（课段教师 == 课程教师时清掉）", /UPDATE schedules SET teacher = NULL[\s\S]{0,200}c\.teacher/.test(service));
  check("addSchedule 写 teacher", /INSERT INTO schedules \([^)]*teacher\)/.test(service) && service.includes("schedule.teacher ?? null"));
  check("updateSchedule 写 teacher", /UPDATE schedules SET[\s\S]{0,320}teacher = \$\d+ WHERE id/.test(service));
  check("撤销/重做整表写回也带 teacher", (service.match(/INSERT INTO schedules \(id, course_id/g) || []).length === 1 && service.includes("schedule.teacher ?? null"));
}

console.log("\n=== F. 接线：三个读法都课段优先 ===");
{
  const block = read("src/components/timetable/CourseBlock.vue");
  check("卡片：课段教师优先", block.includes("props.schedule.teacher || props.course.teacher"), block.match(/const teacherText[^\n]*/)?.[0]);
  check("长按展开才显示教师行", /v-if="isExpanded && teacherText"/.test(block));

  const home = read("src/views/HomeView.vue");
  check("编辑框预填课段教师", home.includes("teacher: schedule.teacher || course?.teacher || \"\""), home.match(/teacher: schedule[^\n]*/)?.[0]);

  const list = read("src/views/CourseListView.vue");
  check("课程列表用去重后的教师标签", list.includes("teacherLabel(course.teacher, getCourseSchedules(course.id).map(s => s.teacher))"), "列表还在只显示 course.teacher");
  check("列表隐藏空教师行", /v-if="courseTeacher\(course\)"/.test(list));

  const courses = read("src/composables/useCourses.ts");
  check("整学期改教师会清全部课段教师", /if \(teacherChanged\) \{[\s\S]{0,300}scheduleIdsWithOwnTeacher/.test(courses));
  // 未改教师时必须保留合法的课段差异；完整编辑行为见 test-teacher-edits.mjs。
  check("教师变更算作变更（否则保存无反应）", courses.includes("!spanChanged && !fieldsChanged && !clearedLocations"));
  check("按周保存传的是两个字段各自的变更", /patchWeeklyRowForOverlay\(weekly, overlayCourseId[\s\S]{0,120}teacher: teacherChanged/.test(courses));
  check("备份恢复带回课段教师", courses.includes("teacher: schedule.teacher"));
}

console.log("\n=== G. 类型 ===");
{
  const types = read("src/types/course.ts");
  check("CourseSchedule 有 teacher", /export interface CourseSchedule \{[\s\S]{0,700}teacher\?: string/.test(types));
}

if (failed) {
  console.log(`\n${failed} 项失败`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
