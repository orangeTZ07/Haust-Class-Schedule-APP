#!/usr/bin/env node
//
// haust_spider.py 的输出 → 本应用能恢复的备份格式。
//
// 逻辑本身不在这里：周次压缩与课程归组都在 src/services/eams/courseTableParser.ts，与内置到
// 应用里的那份**是同一份代码**。这个文件只是命令行外壳。
//
// 为什么坚持一份实现：解析规则一旦有两份，迟早漂移，而漂移出来的课表错误最难发现 ——
// 课表看着正常，但排在了错的日子、或周次少了一半。
//
// 用法:
//   node scripts/scraper-json-to-backup.mjs courses.json            # 输出到 stdout
//   node scripts/scraper-json-to-backup.mjs courses.json -o backup.json
//   node scripts/scraper-json-to-backup.mjs -o backup.json < courses.json
//
// 报告走 stderr，数据走 stdout，所以可以直接重定向。

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { rowsToBackup } = await loadTs(join(here, "..", "src", "services", "eams", "courseTableParser.ts"));

/// 应用默认配置是 10 节；超出会渲染不出来，所以单独提醒。
const DEFAULT_PERIOD_COUNT = 10;

const args = process.argv.slice(2);
let inputPath = "";
let outputPath = "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-o" || args[i] === "--out") outputPath = args[++i] ?? "";
  else if (!inputPath) inputPath = args[i];
}

const raw = inputPath ? readFileSync(inputPath, "utf8") : readFileSync(0, "utf8");
const rows = JSON.parse(raw);
const { backup, report } = rowsToBackup(rows);

// 报告走 stderr，数据走 stdout，这样可以安全地重定向。
const log = (line) => process.stderr.write(line + "\n");
log(`输入 ${report.rows} 条活动 → ${report.courses} 门课程 / ${report.schedules} 条日程`);

if (report.skippedNoDay > 0) {
  log(`跳过 ${report.skippedNoDay} 条：星期无法解析。这是最不可靠的一环，宁可漏也不要排错日子。`);
}
if (report.skippedBadPeriod > 0) {
  log(`跳过 ${report.skippedBadPeriod} 条：节次不合法。`);
}
report.notes.forEach((note) => log(`注意：${note}`));
report.problems.slice(0, 20).forEach((problem) => log(`  - ${problem}`));
if (report.problems.length > 20) log(`  …另有 ${report.problems.length - 20} 条同类问题`);

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
