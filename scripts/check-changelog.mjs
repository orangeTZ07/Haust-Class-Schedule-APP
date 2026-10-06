// 检查 CHANGELOG.md 的格式：[Unreleased] 和所有大于 0.2.0 的版本节，只能有「新功能」「修复」两个分类。
//
// 为什么要卡：这个文件是 GitHub Release 正文的唯一来源，App 里「发现新版本」弹窗显示的更新说明
// 也是从 Release 正文里解析出来的（src/services/updateService.ts）。格式一乱，用户看到的就是
// 空白、半截或者一堆英文标题；而发版是打 tag 之后才开始构建的，等构建完才发现就晚了。
// 所以 PR 上先查一遍，打 tag 时在构建前再查一遍（--release）。
//
// 0.2.0 及更早的版本用的是旧分类（Added / Fixed ...），不检查，保持原样。
//
// 用法:
//   node scripts/check-changelog.mjs                      检查 [Unreleased] 和 0.2.0 之后的所有版本节
//   node scripts/check-changelog.mjs --release 0.3.0      再要求 ## [0.3.0] 这一节存在、且至少有一条
//   node scripts/check-changelog.mjs --file 某个文件.md   检查别的文件（造测试样本用）
//
// 无依赖，只需要 Node。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/// 这个版本及以前的节不检查。
const LEGACY_LAST_VERSION = [0, 2, 0];
const ALLOWED_CATEGORIES = ["新功能", "修复"];

const SECTION_HEADING = /^##\s+\[([^\]]*)\]/;
const CATEGORY_HEADING = /^###\s+(.*?)\s*$/;
const ANY_DEEP_HEADING = /^#{3,}\s/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
// 文件末尾 Keep a Changelog 风格的链接定义：[Unreleased]: https://...
const LINK_DEFINITION = /^\[[^\]]+\]:\s/;

const usage = () => {
  console.error("用法: node scripts/check-changelog.mjs [--release <版本号>] [--file <路径>]");
  process.exit(2);
};

let releaseVersion = null;
let filePath = join(here, "..", "CHANGELOG.md");

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const readValue = (name) => {
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    const next = args[++i];
    if (next === undefined || next.startsWith("--")) {
      console.error(`${name} 后面要跟一个值。`);
      usage();
    }
    return next;
  };

  if (arg === "--release" || arg.startsWith("--release=")) releaseVersion = readValue("--release").replace(/^[vV]/, "");
  else if (arg === "--file" || arg.startsWith("--file=")) filePath = readValue("--file");
  else {
    console.error(`不认识的参数：${arg}`);
    usage();
  }
}

const problems = [];
const report = (line, message) => problems.push({ line, message });

/// 只比主版本.次版本.修订号：带 `-` 后缀的预发布版本和同号正式版是同一天的事，
/// 0.2.0-rc.1 比 0.2.0 还早，当然也在「旧格式」那一边。
const isAfterLegacy = (version) => {
  const match = SEMVER.exec(version);
  if (!match) return false;
  const core = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let i = 0; i < 3; i++) {
    if (core[i] !== LEGACY_LAST_VERSION[i]) return core[i] > LEGACY_LAST_VERSION[i];
  }
  return false;
};

let text;
try {
  text = readFileSync(filePath, "utf8");
} catch (e) {
  console.error(`读不了 ${filePath}：${e.message}`);
  process.exit(2);
}
const lines = text.split(/\r?\n/);

// ---------- 切成版本节 ----------
// 第一个 `## [` 之前是「怎么用」之类的说明文字，不属于任何版本节。
const sections = [];
lines.forEach((content, index) => {
  const match = SECTION_HEADING.exec(content);
  if (match) {
    sections.push({ name: match[1].trim(), line: index + 1, start: index + 1, end: lines.length });
    if (sections.length > 1) sections[sections.length - 2].end = index;
  }
});

const isUnreleased = (section) => section.name.toLowerCase() === "unreleased";
const shouldCheck = (section) => isUnreleased(section) || isAfterLegacy(section.name);

/// 数一节里有多少条 `- ` 开头的条目（不看分类，用来给旧格式的节也能回答「有没有内容」）。
const countItems = (section) => {
  let count = 0;
  for (let i = section.start; i < section.end; i++) {
    if (/^-\s+\S/.test(lines[i])) count++;
  }
  return count;
};

// ---------- 检查一个版本节 ----------
const checkSection = (section) => {
  const label = isUnreleased(section) ? "[Unreleased]" : `[${section.name}]`;
  let category = null;
  // 标题不合法的分类：标题已经报过错了，它下面的条目就别再各报一遍「不在任何分类下面」。
  let inRejectedCategory = false;
  let categoryLine = 0;
  let categoryItems = 0;
  const seen = new Set();

  const closeCategory = () => {
    if (category && categoryItems === 0) {
      report(categoryLine, `${label} 里的「### ${category}」下面一条都没有。没有内容的分类请整个删掉，不要留空标题。`);
    }
  };

  for (let i = section.start; i < section.end; i++) {
    const number = i + 1;
    const content = lines[i];
    if (!content.trim() || LINK_DEFINITION.test(content)) continue;

    const heading = CATEGORY_HEADING.exec(content);
    if (heading) {
      closeCategory();
      const title = heading[1];
      inRejectedCategory = false;
      if (!ALLOWED_CATEGORIES.includes(title)) {
        report(number, `${label} 里出现了分类「### ${title}」。0.2.0 之后只能用「### 新功能」和「### 修复」，已有功能的变化也写进「新功能」，写成「现在……」「改为……」。`);
        category = null;
        inRejectedCategory = true;
        continue;
      }
      if (seen.has(title)) {
        report(number, `${label} 里「### ${title}」写了两次，请合并成一个。`);
      }
      seen.add(title);
      category = title;
      categoryLine = number;
      categoryItems = 0;
      continue;
    }

    if (ANY_DEEP_HEADING.test(content)) {
      report(number, `${label} 里只能有「### 新功能」和「### 修复」这两种标题，这一行的标题不能用。`);
      continue;
    }

    if (/^\s/.test(content)) {
      report(number, `${label} 里这一行是缩进的。一条只写一句话，别换行续写，也别写缩进的子项——App 的更新弹窗不会显示缩进的内容。`);
      continue;
    }

    if (/^-(\s|$)/.test(content)) {
      if (!content.slice(1).trim()) {
        report(number, `${label} 里这一条是空的，「- 」后面要写一句话。`);
      } else if (inRejectedCategory) {
        // 见上面
      } else if (category === null) {
        report(number, `${label} 里这一条不在任何分类下面。请放到「### 新功能」或「### 修复」下面。`);
      } else {
        categoryItems++;
      }
      continue;
    }

    if (content.startsWith("-")) {
      report(number, `${label} 里条目要以「- 」（短横线加空格）开头。`);
    } else {
      report(number, `${label} 里这一行不是条目。分类标题下面只能放「- 」开头的条目，每条一句话。`);
    }
  }

  closeCategory();
};

const checked = sections.filter(shouldCheck);
for (const section of checked) checkSection(section);

// 版本节标题本身写错了（比如 `## [v0.3]`）：既不是 Unreleased，也认不成版本号。
for (const section of sections) {
  if (!isUnreleased(section) && !SEMVER.test(section.name)) {
    report(section.line, `版本节标题「## [${section.name}]」不是 x.y.z 形式的版本号。`);
  }
}

// ---------- 发版时：该版本的节必须在、且有内容 ----------
if (releaseVersion !== null) {
  if (!SEMVER.test(releaseVersion)) {
    report(0, `--release 给的版本号「${releaseVersion}」不是 x.y.z 形式。tag 应该长得像 v0.3.0。`);
  } else {
    const target = sections.find((section) => section.name === releaseVersion);
    if (!target) {
      report(0, `CHANGELOG.md 里找不到 ## [${releaseVersion}] 这一节。发版前请把 [Unreleased] 的条目剪到这个版本节下面，再打 tag。`);
    } else if (countItems(target) === 0) {
      report(target.line, `## [${releaseVersion}] 这一节下面一条都没有。Release 说明不能是空的。`);
    }
  }
}

// ---------- 输出 ----------
const inGithubActions = process.env.GITHUB_ACTIONS === "true";

if (problems.length > 0) {
  // 「空分类」是读到下一个标题才发现的，按发现顺序会排在后面；按行号排，读起来才是从上往下。
  problems.sort((a, b) => a.line - b.line);
  for (const { line, message } of problems) {
    console.error(line > 0 ? `CHANGELOG.md 第 ${line} 行：${message}` : message);
    // 在 GitHub 上，这样会直接标在 PR 的对应行上。
    if (inGithubActions) {
      console.error(`::error file=CHANGELOG.md${line > 0 ? `,line=${line}` : ""}::${message}`);
    }
  }
  console.error("");
  console.error(`共 ${problems.length} 处问题。写法见 CHANGELOG.md 顶部的「怎么用（给协作者）」。`);
  process.exit(1);
}

const names = checked.map((section) => (isUnreleased(section) ? "[Unreleased]" : `[${section.name}]`));
console.log(`CHANGELOG.md 格式没问题（检查了：${names.join("、") || "没有需要检查的版本节"}）。`);
if (releaseVersion !== null) console.log(`## [${releaseVersion}] 这一节存在，可以发版。`);
