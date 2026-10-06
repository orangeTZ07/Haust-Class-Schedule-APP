// parseBackupFile 的断言。这是「从文件导入」里唯一能在本地完整验证的一段 ——
// 读文件和写课表的其余环节只有真机能验证，而这一段决定"会不会把坏数据写进课表"。
//
// 用法: node scripts/test-backup-file.mjs

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { parseBackupFile } = await loadTs(join(here, "..", "src", "utils", "backupFile.ts"));

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (!ok && detail !== undefined ? "   <- " + JSON.stringify(detail) : ""));
  if (!ok) failures++;
};

const good = JSON.stringify({
  exportedAt: "2026-10-05T00:00:00.000Z",
  currentWeek: 1,
  courses: [{ id: 1, name: "线性代数B" }],
  schedules: [{ id: 1, courseId: 1, dayOfWeek: 1, startPeriod: 1, endPeriod: 2, startWeek: 2, endWeek: 14, weekType: "all" }]
});

console.log("=== 合法备份 ===");
{
  const r = parseBackupFile(good);
  check("通过校验", r.ok === true, r);
  check("报出课程数", r.courses === 1, r.courses);
  check("报出日程数", r.schedules === 1, r.schedules);
  check("把原文带出来（供 importFromJsonBackup 使用）", typeof r.text === "string" && r.text.includes("线性代数B"));
}

console.log("");
console.log("=== 各种坏输入都必须被拒绝，并说清原因 ===");
const cases = [
  ["空文件", "", "空"],
  ["只有空格", "   \n  ", "空"],
  ["不是 JSON", "这不是 JSON", "JSON"],
  ["JSON 但顶层是数组", "[1,2,3]", "不是备份格式"],
  ["JSON 但顶层是字符串", "\"hello\"", "不是备份格式"],
  ["缺少 courses", '{"schedules":[]}', "courses"],
  ["缺少 schedules", '{"courses":[]}', "schedules"],
  ["courses 不是数组", '{"courses":{},"schedules":[]}', "courses"],
  ["有日程但没课程", '{"courses":[],"schedules":[{"id":1}]}', "不完整"]
];
cases.forEach(([label, input, expect]) => {
  const r = parseBackupFile(input);
  check(`${label} -> 被拒且说明原因`, r.ok === false && String(r.error).includes(expect), r);
});

console.log("");
console.log("=== 边界：空课表也算合法（用户可能就是导入一份空表）===");
{
  const r = parseBackupFile('{"courses":[],"schedules":[]}');
  check("courses 与 schedules 都为空 -> 通过", r.ok === true, r);
  check("且报数为 0", r.courses === 0 && r.schedules === 0, r);
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
