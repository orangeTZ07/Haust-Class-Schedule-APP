// 地点只有一个真相来源：课程的 location。
//
// 这一组断言盯的是「改完地点、格子还显示旧地点」那类回归：卡片、长按详情、提醒、CSV 都是
// 「课段优先」（schedule.location || course.location），所以任何一条写路径漏清课段地点，
// 用户就会看到「保存成功、格子没变」。纯逻辑在这里跑，接线只做源码级检查。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const sync = await loadTs(join(root, "src/utils/locationSync.ts"));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const row = (over = {}) => ({
  id: 1,
  courseId: 9,
  dayOfWeek: 1,
  startPeriod: 1,
  endPeriod: 2,
  startWeek: 1,
  endWeek: 16,
  weekType: "all",
  scope: "semester",
  isCancelled: false,
  ...over
});

console.log("=== A. 整学期：清理范围是这门课的全部课段 ===");
{
  const schedules = [
    row({ id: 1, courseId: 9, location: "泰达西院6-210(d)" }),
    row({ id: 2, courseId: 9, dayOfWeek: 3, location: "泰达西院6-210(d)" }),
    row({ id: 3, courseId: 9, startPeriod: 5, endPeriod: 6, location: "工科4-206" }),
    row({ id: 4, courseId: 9, dayOfWeek: 5, startPeriod: 7, endPeriod: 8 }), // 没有课段地点
    row({ id: 5, courseId: 9, isCancelled: true, location: "停课地点" }), // 停课不算
    row({ id: 6, courseId: 10, location: "别的课的教室" }) // 别的课不能碰
  ];
  const ids = sync.scheduleIdsWithOwnLocation(schedules, 9);
  check("同一门课的三个格子都进清理名单", ids.includes(1) && ids.includes(2) && ids.includes(3), ids);
  check("没有课段地点的行不进名单", !ids.includes(4), ids);
  check("停课行不进名单", !ids.includes(5), ids);
  check("别的课程不进名单", !ids.includes(6), ids);
  check("名单长度正好 3", ids.length === 3, ids);
  check("顺序按传入顺序稳定", JSON.stringify(ids) === "[1,2,3]", ids);
}

console.log("=== B. 仅本周 / 自定义周：搬到覆盖层的那一行 ===");
{
  const moved = sync.patchWeeklyRowForOverlay(
    row({ id: 7, courseId: 9, location: "泰达西院6-210(d)", scope: "weekly", startWeek: 9, endWeek: 9 }),
    42,
    4,
    { location: true, teacher: false }
  );
  check("改挂了覆盖层课程", moved.courseId === 42, moved.courseId);
  check("节次跟着 span 走", moved.endPeriod === 4, moved.endPeriod);
  check("改了字段就清掉课段级地点（否则卡片显示旧教室）", moved.location === undefined, moved.location);
  check("其余字段原样保留", moved.id === 7 && moved.dayOfWeek === 1 && moved.startWeek === 9, moved);

  const spanOnly = sync.patchWeeklyRowForOverlay(
    row({ id: 8, courseId: 9, location: "泰达西院6-210(d)", scope: "weekly", startWeek: 9, endWeek: 9 }),
    9,
    4,
    { location: false, teacher: false }
  );
  check("只改节次时保留课段地点", spanOnly.location === "泰达西院6-210(d)", spanOnly.location);
  check("只改节次时课程不变", spanOnly.courseId === 9, spanOnly.courseId);
}

console.log("=== C. 接线：三处必须一致 ===");
{
  const courses = readFileSync(join(root, "src/composables/useCourses.ts"), "utf8");
  const semesterBranch = courses.slice(
    courses.indexOf('if (weeks === "all")'),
    courses.indexOf("let overlayCourseId")
  );
  check("整学期分支用 scheduleIdsWithOwnLocation", semesterBranch.includes("scheduleIdsWithOwnLocation(schedules.value, course.id)"));
  check("整学期分支不再用「同一格」当清理范围", !/if \(locationChanged\) \{\s*for \(const scheduleId of idsForSemesterDelete/.test(courses));
  check("地点没改时不清课段（否则会毁掉多教室导入的数据）", semesterBranch.includes("if (locationChanged) {"), semesterBranch.slice(0, 200));
  check("清理写在 locationChanged 守卫里面", /if \(locationChanged\) \{[\s\S]{0,400}scheduleIdsWithOwnLocation/.test(semesterBranch));
  // 不同课段可以合法使用不同教室；未改地点时应保留，行为见 test-teacher-edits.mjs。
  check("清理算作变更（否则 toast 说成功、其实什么都没干）", courses.includes("!spanChanged && !fieldsChanged && !clearedLocations"));
  check("按周分支用 patchWeeklyRowForOverlay", courses.includes("patchWeeklyRowForOverlay(weekly, overlayCourseId"));

  const home = readFileSync(join(root, "src/views/HomeView.vue"), "utf8");
  check("编辑框预填课段优先", home.includes("location: schedule.location || course?.location || \"\""), home.includes("location: course?.location ?? \"\""));

  const service = readFileSync(join(root, "src/services/courseService.ts"), "utf8");
  check("库启动时收拢冗余的课段地点", /UPDATE schedules SET location = NULL[\s\S]{0,200}c\.location/.test(service));
  check("收拢语句幂等（比较值而不是盲目清空）", service.includes("AND location = (SELECT c.location FROM courses c WHERE c.id = schedules.course_id)"));

  const block = readFileSync(join(root, "src/components/timetable/CourseBlock.vue"), "utf8");
  check("卡片仍然是课段优先（其余读法都靠它兜底）", block.includes("props.schedule.location || props.course.location"));
}

console.log("=== D. CHANGELOG 记了一条 ===");
{
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  check("写了「改地点不生效」", /### 修复[\s\S]*改.*地点|改.*地点[\s\S]{0,80}不生效/.test(changelog), changelog.slice(0, 400));
}

if (failed) {
  console.log(`\n${failed} 项失败`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
