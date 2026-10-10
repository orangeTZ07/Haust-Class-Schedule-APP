// 按周覆盖只替换同一门课自己的学期安排，不能把叠在同一格的另一门课藏掉。

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const layer = await loadTs(join(here, "..", "src/utils/weekOverride.ts"));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const math = { courseId: 1, dayOfWeek: 1, startPeriod: 1, endPeriod: 2 };
const front = { courseId: 2, dayOfWeek: 1, startPeriod: 3, endPeriod: 4 };
const moved = { courseId: 1, dayOfWeek: 1, startPeriod: 3, endPeriod: 4 };
const cancelled = { courseId: 1, dayOfWeek: 1, startPeriod: 1, endPeriod: 2 };

console.log("=== 拖到另一门课上面 ===");
{
  const weekly = [cancelled, moved];
  check("原来那格的学期课被这一周的取消藏掉", layer.baseHiddenByWeekly(math, weekly) === true);
  check("被盖住的另一门课还在", layer.baseHiddenByWeekly(front, weekly) === false);
}

console.log("=== 只改自己的时间 ===");
{
  const shifted = { courseId: 1, dayOfWeek: 1, startPeriod: 5, endPeriod: 6 };
  check("挪到空格子仍藏起原来的学期课", layer.baseHiddenByWeekly(math, [cancelled, shifted]) === true);
  check("没被盖到的课不受影响", layer.baseHiddenByWeekly(front, [cancelled, shifted]) === false);
  check("没有任何覆盖时学期课都在", layer.baseHiddenByWeekly(math, []) === false);
}

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n  ALL CHECKS PASSED");
