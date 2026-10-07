// 删除课段的周次范围：整学期 / 仅当前周 / 自定义。不打开界面。

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const del = await loadTs(join(here, "..", "src/utils/scheduleDelete.ts"));

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
  ...over
});

console.log("=== 删除周次 ===");
{
  check("默认仅当前周是第 4 周", JSON.stringify(del.weeksForDeleteScope({ weekScope: "current" }, 4)) === "[4]");
  check("整学期是 all", del.weeksForDeleteScope({ weekScope: "all" }, 4) === "all");
  check(
    "自定义 3-5 全部周",
    JSON.stringify(del.weeksForDeleteScope({ weekScope: "custom", startWeek: 3, endWeek: 5, weekType: "all" }, 4)) === "[3,4,5]"
  );
  check(
    "自定义只要单周",
    JSON.stringify(del.weeksForDeleteScope({ weekScope: "custom", startWeek: 1, endWeek: 5, weekType: "odd" }, 1)) === "[1,3,5]"
  );
  check(
    "二次确认文案点明不可仅靠返回键恢复",
    del.DELETE_SEMESTER_CONFIRM.message.includes("不可仅靠返回键恢复")
  );
}

console.log("=== 同一格 ===");
{
  const semester = row();
  const overlay = row({ id: 2, scope: "weekly", startWeek: 4, endWeek: 4, isCancelled: true });
  const otherDay = row({ id: 3, dayOfWeek: 2 });
  const ids = del.idsForSemesterDelete([semester, overlay, otherDay], semester);
  check("整学期只清这一格的学期课和覆盖层", JSON.stringify(ids) === "[1,2]", ids);
  check("另一天的同一门课留下", !ids.includes(3));
}

console.log("=== 按周取消 ===");
{
  const semester = row();
  check("学期课这一周还需要取消层", del.needsWeeklyCancel([semester], semester, 4) === true);
  const existing = row({ id: 2, scope: "weekly", startWeek: 4, endWeek: 4, isCancelled: true });
  check("已经有取消层就不再加", del.needsWeeklyCancel([semester, existing], semester, 4) === false);
  const weekly = row({ id: 8, scope: "weekly", startWeek: 4, endWeek: 4, isCancelled: false });
  check("本来就是这一周的覆盖层就删这一条", del.weeklyRowToDelete([weekly], weekly, 4)?.id === 8);
  check("学期课没有按周那一条可删", del.weeklyRowToDelete([semester], semester, 4) === null);
}

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n  ALL CHECKS PASSED");
