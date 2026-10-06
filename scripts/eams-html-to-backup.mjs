#!/usr/bin/env node
//
// 教务系统课表响应（courseTableForStd!courseTable.action 的 HTML）→ 应用可恢复的备份格式。
//
// 逻辑在 src/services/eams/courseTableParser.ts，与内置到应用里的那份是同一份代码；这里只是外壳。
// 它取代了早期的 eams-html-to-courses.mjs + scraper-json-to-backup.mjs 两步走 —— 两步之间那份
// 中间 JSON 只是为了迁就当时的实现，现在没必要了。
//
// 用法:
//   node scripts/eams-html-to-backup.mjs dump_jwgl.haust.edu.cn_coursetable.html -o backup.json
//   node scripts/eams-html-to-backup.mjs dump_....html            # 输出到 stdout

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { parseCourseTable, rowsToBackup } = await loadTs(
  join(here, "..", "src", "services", "eams", "courseTableParser.ts")
);

const DEFAULT_PERIOD_COUNT = 10;

const args = process.argv.slice(2);
let inputPath = "";
let outputPath = "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-o" || args[i] === "--out") outputPath = args[++i] ?? "";
  else if (!inputPath) inputPath = args[i];
}

if (!inputPath) {
  process.stderr.write("用法: node scripts/eams-html-to-backup.mjs <课表响应HTML> [-o backup.json]\n");
  process.exit(1);
}

const html = readFileSync(inputPath, "utf8");
const { rows, problems } = parseCourseTable(html);
const { backup, report } = rowsToBackup(rows);

const log = (line) => process.stderr.write(line + "\n");
log(`解析出 ${report.rows} 条课程活动 → ${report.courses} 门课程 / ${report.schedules} 条日程`);

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const byDay = {};
rows.forEach((r) => { byDay[r.day_of_week] = (byDay[r.day_of_week] || 0) + 1; });
log("按星期分布: " + Object.entries(byDay).sort().map(([d, n]) => `${dayNames[d - 1]} ${n}`).join("  "));

if (problems.length) problems.slice(0, 10).forEach((p) => log("  - " + p));
report.notes.forEach((note) => log("注意：" + note));

if (report.maxPeriod > DEFAULT_PERIOD_COUNT) {
  log(`注意：课表最大节次是第 ${report.maxPeriod} 节，而应用默认只显示 ${DEFAULT_PERIOD_COUNT} 节。`);
  log(`      导入后请到 设置 → 网格设置 把节数调到至少 ${report.maxPeriod}。`);
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
