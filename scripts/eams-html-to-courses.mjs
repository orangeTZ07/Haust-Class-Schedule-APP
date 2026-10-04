#!/usr/bin/env node
//
// EAMS 课表响应（courseTableForStd!courseTable.action 的 HTML）→ 爬虫输出的课程 JSON。
//
// 为什么输出这个形状：scripts/scraper-json-to-backup.mjs 已经能把这种 JSON 转成应用可恢复的
// 备份格式，而且那一层有 26 条断言覆盖（周次压缩、周日、星期缺失、越界节次等）。所以这里只
// 负责把 HTML 读成同一种形状，不重复实现一套周次逻辑 —— 两份实现必然会漂移。
//
// 解析规则全部来自真实响应，不是猜的：
//
//   1. 每条课由 `new TaskActivity(...)` 描述，14 个参数。已核对：
//        [ 3] 课程名   [ 5] 教室   [ 6] 周次位串   [12][13] 起止节次
//   2. **星期不在参数里**，而在紧随其后的 `index = N * unitCount + M` 这句赋值里：
//        N 就是星期（0 起算，0=周一），M 是当天第几节。
//      这一条被页面自身的结构交叉验证过：unitCount = 14，且 table0 = new CourseTable(2026, 98)，
//      而 7 天 × 14 节 = 98，正好等于 N∈0..6、M∈0..13 能覆盖的下标范围。
//      原爬虫以为星期"通常不含"于是写了 5 层兜底去猜 —— 其实它一直明文在那里。
//   3. 周次位串**一个字符 = 一周**，长度 53（学期之外的部分补 0）。
//      验证方式：线性代数B 有两条活动，周一那条是连续第 2..14 周、周五那条是第 2,4,6..14 周，
//      合起来正好是"两周三节、一节/两节轮替"—— 与该课程的真实排课一致。
//   4. 教师姓名在活动之后的 `var teachers = [{id:...,name:"李学军",lab:true}]` 里，
//      参数位置只有 actTeacherName.join(',') 这个运行时表达式。
//
// 用法：
//   node scripts/eams-html-to-courses.mjs dump_jwgl.haust.edu.cn_coursetable.html > courses.json
//   node scripts/scraper-json-to-backup.mjs courses.json -o backup.json

import { readFileSync, writeFileSync } from "node:fs";

/// 位串按周计：第 i 个字符为 '1' 表示第 i+1 周有课。
const weeksFromBits = (bits) =>
  [...bits].reduce((acc, ch, i) => (ch === "1" ? acc.concat(i + 1) : acc), []);

/// 去掉 (rjxy_1012049.001) 这类课程代码后缀，并把 <sup> 标签还原成文字。
/// 体育课的真实名字是「体育（3）<sup style='...'>篮球</sup>」，直接留着标签会显示成乱码。
const cleanName = (raw) =>
  raw
    .replace(/<sup[^>]*>/gi, "")
    .replace(/<\/sup>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\([a-z]+_\d+\.\d+\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

/// 按引号规则切分参数 —— 教室名里出现逗号是常态，简单 split(',') 会切错。
const splitArgs = (text) => {
  const out = [];
  let current = "";
  let quote = null;
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

const unquote = (value) => {
  const text = (value ?? "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
};

const parse = (html) => {
  const rows = [];
  const problems = [];

  const callRe = /new\s+TaskActivity\s*\(([\s\S]*?)\)\s*;/g;
  let match;
  let index = 0;

  while ((match = callRe.exec(html)) !== null) {
    index += 1;
    const args = splitArgs(match[1]);
    const after = html.slice(match.index + match[0].length, match.index + match[0].length + 700);

    if (args.length < 14) {
      problems.push(`第 ${index} 条只有 ${args.length} 个参数（期望 14），已跳过`);
      continue;
    }

    // 星期：紧随其后的 index = N * unitCount + M
    const dayMatch = after.match(/index\s*=\s*(\d+)\s*\*\s*unitCount/);
    if (!dayMatch) {
      problems.push(`第 ${index} 条（${cleanName(unquote(args[3])) || "未命名"}）找不到 index = N*unitCount，已跳过`);
      continue;
    }
    const day = parseInt(dayMatch[1], 10) + 1; // 页面是 0 起算，应用是 1=周一
    if (day < 1 || day > 7) {
      problems.push(`第 ${index} 条星期解析为 ${day}（超出 1-7），已跳过`);
      continue;
    }

    // 教师：参数里是 actTeacherName.join(',')，真名在后面的 var teachers = [...]
    const teacherMatch = after.match(/var\s+teachers\s*=\s*(\[[\s\S]*?\])\s*;?/);
    let teacher = "";
    if (teacherMatch) {
      const names = [...teacherMatch[1].matchAll(/name\s*:\s*["']([^"']*)["']/g)].map((x) => x[1].trim());
      teacher = names.filter(Boolean).join("、");
    }

    const startUnit = parseInt(unquote(args[12]), 10);
    const endUnit = parseInt(unquote(args[13]), 10);
    if (!Number.isInteger(startUnit) || !Number.isInteger(endUnit)) {
      problems.push(`第 ${index} 条节次不是数字（${unquote(args[12])}/${unquote(args[13])}），已跳过`);
      continue;
    }

    rows.push({
      course_name: cleanName(unquote(args[3])),
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

const main = () => {
  const args = process.argv.slice(2);
  let inputPath = "";
  let outputPath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--out") outputPath = args[++i] ?? "";
    else if (!inputPath) inputPath = args[i];
  }

  const html = inputPath ? readFileSync(inputPath, "utf8") : readFileSync(0, "utf8");
  const { rows, problems } = parse(html);

  const log = (line) => process.stderr.write(line + "\n");
  log(`解析出 ${rows.length} 条课程活动`);

  const byDay = {};
  rows.forEach((r) => { byDay[r.day_of_week] = (byDay[r.day_of_week] || 0) + 1; });
  const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  log("按星期分布: " + Object.entries(byDay).sort().map(([d, n]) => `${dayNames[d - 1]} ${n}`).join("  "));

  const noRoom = rows.filter((r) => !r.room).length;
  if (noRoom) log(`注意: ${noRoom} 条没有教室（体育课常见），已留空`);
  const noTeacher = rows.filter((r) => !r.teacher).length;
  if (noTeacher) log(`注意: ${noTeacher} 条没解析到教师姓名`);

  const maxPeriod = rows.reduce((max, r) => Math.max(max, r.end_unit), 0);
  if (maxPeriod > 10) {
    log(`注意: 课表最大节次是第 ${maxPeriod} 节，而应用默认只显示 10 节。`);
    log(`      导入后请到 设置 → 网格设置 把节数调到至少 ${maxPeriod}。`);
  }
  problems.forEach((p) => log("  - " + p));

  const json = JSON.stringify(rows, null, 2);
  if (outputPath) {
    writeFileSync(outputPath, json, "utf8");
    log(`已写入 ${outputPath}`);
  } else {
    process.stdout.write(json + "\n");
  }

  log("");
  log("下一步: node scripts/scraper-json-to-backup.mjs courses.json -o backup.json");
};

main();
