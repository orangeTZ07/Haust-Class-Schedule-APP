// updateService 的断言：版本比较、更新说明解析、选下载链接、取 Release 的各种失败。
//
// 为什么要测：这几处出错都不会报错，只会悄悄给用户错的结果 ——
//   - 版本比较错了：有新版却显示「已是最新」，或者没新版却一直弹框；
//   - 正文解析错了：弹框里出现图片链接、版本标题行，或者「修复」被「新功能」挤得一条都看不到；
//   - 失败原因丢了：手动检查失败时只剩一句「失败」，没法判断是断网还是被限流。
//
// 用法: node scripts/test-update-check.mjs

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const svc = await loadTs(join(here, "..", "src", "services", "updateService.ts"));

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (!ok && detail !== undefined ? "   <- " + JSON.stringify(detail) : ""));
  if (!ok) failures++;
};
const same = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), actual);

const throwsMessage = async (fn) => {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return null;
};

// ---------- 版本比较 ----------
console.log("=== 版本比较 ===");
const cmp = svc.compareVersions;
same("0.2.0 == v0.2.0（前导 v 不影响）", cmp("0.2.0", "v0.2.0"), 0);
same("0.3.0 > 0.2.0", cmp("0.3.0", "0.2.0"), 1);
same("0.2.1 > 0.2.0", cmp("0.2.1", "0.2.0"), 1);
same("1.0.0 > 0.99.99", cmp("1.0.0", "0.99.99"), 1);
same("★ 0.10.0 > 0.9.0（按数值比，不按字符串比）", cmp("0.10.0", "0.9.0"), 1);
same("0.2.0 < 0.2.1", cmp("0.2.0", "0.2.1"), -1);
same("0.9.9 < 1.0.0", cmp("0.9.9", "1.0.0"), -1);
same("★ 预发布低于同号正式版：0.3.0-rc.1 < 0.3.0", cmp("0.3.0-rc.1", "0.3.0"), -1);
same("★ 反过来：0.3.0 > 0.3.0-rc.1", cmp("0.3.0", "0.3.0-rc.1"), 1);
same("预发布仍高于更低的正式版：0.3.0-rc.1 > 0.2.9", cmp("0.3.0-rc.1", "0.2.9"), 1);
same("构建信息被忽略：0.2.0+build5 == 0.2.0", cmp("0.2.0+build5", "0.2.0"), 0);
same("两个预发布相同", cmp("1.0.0-beta.2", "1.0.0-beta.2"), 0);

// semver 2.0.0 第 11 条给出的预发布排序链
const chain = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"];
let chainOk = true;
for (let i = 0; i + 1 < chain.length; i++) {
  if (cmp(chain[i], chain[i + 1]) !== -1 || cmp(chain[i + 1], chain[i]) !== 1) chainOk = false;
}
check("semver 规范里的预发布排序链全部成立", chainOk);

console.log("");
console.log("=== 认不出的版本号要报错，不能当成「没有新版」 ===");
for (const bad of ["", "latest", "1.2", "v1.2.x", "1.2.3.4", "release-1"]) {
  const message = await throwsMessage(() => cmp(bad, "0.2.0"));
  check(`「${bad}」抛错且说明是哪个版本号`, message !== null && message.includes("格式不对"), message);
}
check("当前版本这边写坏了也抛错", (await throwsMessage(() => cmp("0.3.0", "oops"))) !== null);
same("isNewerVersion 新版为真", svc.isNewerVersion("v0.3.0", "0.2.0"), true);
same("isNewerVersion 同版本为假", svc.isNewerVersion("v0.2.0", "0.2.0"), false);
same("isNewerVersion 比当前旧为假（回滚发布不提示）", svc.isNewerVersion("v0.1.1", "0.2.0"), false);
same("displayVersion 统一加 v", [svc.displayVersion("0.3.0"), svc.displayVersion("v0.3.0")], ["v0.3.0", "v0.3.0"]);
same("同号预发布 alpha < beta < rc < 正式", [cmp("0.4.1-alpha.1", "0.4.1-beta.1"), cmp("0.4.1-beta.1", "0.4.1-rc.1"), cmp("0.4.1-rc.1", "0.4.1")], [-1, -1, -1]);
same("预览弹窗标题带预览", svc.updateOfferTitle("0.4.1-alpha.1"), "发现预览版 v0.4.1-alpha.1");
same("正式弹窗标题带新版本", svc.updateOfferTitle("v0.4.1"), "发现新版本 v0.4.1");

// ---------- 更新说明解析 ----------
console.log("");
console.log("=== 更新说明：旧格式（真实的 0.2.0 Release 正文）===");
const oldBody = [
  "![App Icon](https://github.com/orangeTZ07/Haust-Class-Schedule-APP/releases/download/v0.2.0/app-icon.png)",
  "",
  "## [0.2.0] - 2026-10-06",
  "",
  "### Added",
  "",
  "- 教务系统在线同步：支持输入学号与密码直接从河南科技大学教务系统同步课表到应用",
  "- 离线课表文件导入：支持直接选取本地 JSON 备份文件导入课表，无需联网",
  "- iOS 平台支持：新增 iOS 构建配置与 GitHub Actions 自动化打包工作流",
  "",
  "### Fixed",
  "",
  "- 修复 Android 端上课提醒因底层参数解析失败而未实际生效的问题",
  "- 修复设置页中提醒失败时将错误原因误显示为「undefined」的问题",
  "- 修复导入备份后执行「恢复课表数据」反而会清空最新课表的问题",
  "- 修复教务系统网关拦截 403 导致无法连接的问题",
  ""
].join("\n");
const oldGroups = svc.parseReleaseNotes(oldBody);
same("分成两组：新功能、修复", oldGroups.map((g) => g.title), ["新功能", "修复"]);
same("新功能 3 条，修复 4 条", oldGroups.map((g) => g.items.length), [3, 4]);
check("图片行没有进来", !JSON.stringify(oldGroups).includes("App Icon") && !JSON.stringify(oldGroups).includes("app-icon.png"));
check("版本标题行没有进来", !JSON.stringify(oldGroups).includes("2026-10-06") && !JSON.stringify(oldGroups).includes("[0.2.0]"));
same("条目文字原样保留（不含 `- ` 前缀）", oldGroups[1].items[3], "修复教务系统网关拦截 403 导致无法连接的问题");
same("CRLF 换行结果相同", svc.parseReleaseNotes(oldBody.replace(/\n/g, "\r\n")), oldGroups);

console.log("");
console.log("=== 更新说明：新格式 ===");
const newBody = [
  "![App Icon](https://example.invalid/x.png)",
  "",
  "## [0.3.0] - 2026-11-01",
  "",
  "### 新功能",
  "",
  "- 现在可以在设置页检查更新",
  "- 课表格子里会显示本周日期",
  "",
  "### 修复",
  "",
  "- 修复切换周次后课程错位的问题",
  ""
].join("\n");
same("新格式按「新功能」「修复」分组", svc.parseReleaseNotes(newBody), [
  { title: "新功能", items: ["现在可以在设置页检查更新", "课表格子里会显示本周日期"] },
  { title: "修复", items: ["修复切换周次后课程错位的问题"] }
]);

console.log("");
console.log("=== 更新说明：其他情况 ===");
const mixed = [
  "## [0.4.0] - 2026-12-01",
  "### Fixed",
  "- 修复甲",
  "### Changed",
  "- 改乙",
  "### Added",
  "- 新增丙",
  "### Security",
  "- 补了一个漏洞",
  "### 新功能",
  "- 新增丁"
].join("\n");
const mixedGroups = svc.parseReleaseNotes(mixed);
same("顺序固定为 新功能、改动、修复，其他标题排后面", mixedGroups.map((g) => g.title), ["新功能", "改动", "修复", "Security"]);
same("英文和中文标题合并到同一组", mixedGroups[0].items, ["新增丙", "新增丁"]);
same("Changed -> 改动", mixedGroups[1].items, ["改乙"]);
same("不认识的标题原样显示", mixedGroups[3], { title: "Security", items: ["补了一个漏洞"] });
same("标题大小写不敏感", svc.parseReleaseNotes("### ADDED\n- x")[0].title, "新功能");

same("没有小标题的列表归到「更新内容」", svc.parseReleaseNotes("- 甲\n- 乙"), [{ title: "更新内容", items: ["甲", "乙"] }]);
same("行内 Markdown 去掉记号", svc.parseReleaseNotes("### 修复\n- 修复 **粗体** 和 `代码` 以及 [链接](https://github.com/x/y) 的问题")[0].items[0], "修复 粗体 和 代码 以及 链接 的问题");
same("缩进的子项和续行不算一条", svc.parseReleaseNotes("### 修复\n- 主条目\n  - 子项\n  续行")[0].items, ["主条目"]);
same("`*` 和数字列表也认", svc.parseReleaseNotes("* 甲\n1. 乙").map((g) => g.items), [["甲", "乙"]]);
same("空正文得到空数组", svc.parseReleaseNotes(""), []);
same("只有图片和版本标题得到空数组", svc.parseReleaseNotes("![i](https://x/y.png)\n\n## [1.0.0] - 2026-01-01\n"), []);
same("手写的整段文字（没有列表）也能显示", svc.parseReleaseNotes("这次修了几个问题。\n\n## 说明\n再次感谢大家。").map((g) => g.items), [["这次修了几个问题。", "再次感谢大家。"]]);
same("有列表时，旁边的整段文字不混进来", svc.parseReleaseNotes("前言一句话\n- 条目").map((g) => g.items), [["条目"]]);
same("版本标题行把前面的小标题清掉", svc.parseReleaseNotes("### 修复\n- 甲\n## [0.1.0] - x\n- 乙").map((g) => g.title), ["修复", "更新内容"]);

// ---------- 条数上限 ----------
console.log("");
console.log("=== 条数上限与「…等 N 项」===");
const group = (title, n) => ({ title, items: Array.from({ length: n }, (_, i) => `${title}${i + 1}`) });
const sum = (s) => s.groups.reduce((a, g) => a + g.items.length, 0);

const small = svc.summarizeNotes([group("新功能", 3), group("修复", 3)]);
same("正好 6 条：全留，hidden = 0", [sum(small), small.hidden], [6, 0]);

const big = svc.summarizeNotes([group("新功能", 8), group("修复", 2)]);
same("★ 新功能很多时，修复也要露面：留 6 条，修复 2 条全在", big.groups.map((g) => [g.title, g.items.length]), [["新功能", 4], ["修复", 2]]);
same("hidden = 总数 - 留下的", [sum(big), big.hidden], [6, 4]);
same("留下的是每组靠前的条目", big.groups[0].items, ["新功能1", "新功能2", "新功能3", "新功能4"]);

const lopsided = svc.summarizeNotes([group("新功能", 1), group("修复", 10)]);
same("一边很少时，名额让给另一边", lopsided.groups.map((g) => g.items.length), [1, 5]);
same("自定义上限", sum(svc.summarizeNotes([group("A", 5), group("B", 5)], 4)), 4);
same("空输入", svc.summarizeNotes([]), { groups: [], hidden: 0 });
same("summarizeReleaseBody 串起来：0.2.0 正文 7 条 -> 留 6 条，hidden 1", ((s) => [sum(s), s.hidden])(svc.summarizeReleaseBody(oldBody)), [6, 1]);

// ---------- Release 数据与下载链接 ----------
console.log("");
console.log("=== Release 数据与「立即更新」打开哪里 ===");
const REPO = "https://github.com/orangeTZ07/Haust-Class-Schedule-APP";
const raw = {
  tag_name: "v0.3.0",
  html_url: `${REPO}/releases/tag/v0.3.0`,
  body: newBody,
  assets: [
    { name: "app-icon.png", browser_download_url: `${REPO}/releases/download/v0.3.0/app-icon.png` },
    { name: "course-mngr-v0.3.0-arm64.apk", browser_download_url: `${REPO}/releases/download/v0.3.0/course-mngr-v0.3.0-arm64.apk` }
  ]
};
const release = svc.parseRelease(raw);
same("tag / 页面链接 / 资源", [release.tag, release.htmlUrl, release.assets.length], ["v0.3.0", raw.html_url, 2]);
same("★ Android + 有 APK -> 直接下载链接", svc.pickInstallUrl(release, true), raw.assets[1].browser_download_url);
same("★ 非 Android -> Release 页面", svc.pickInstallUrl(release, false), raw.html_url);
same("★ Android 但 Release 里没传 APK -> Release 页面", svc.pickInstallUrl(svc.parseRelease({ ...raw, assets: [raw.assets[0]] }), true), raw.html_url);
same("没有 assets 字段也不崩", svc.pickInstallUrl(svc.parseRelease({ tag_name: "v1.0.0", html_url: raw.html_url }), true), raw.html_url);
const twoApks = svc.parseRelease({
  ...raw,
  assets: [
    { name: "course-mngr-x86_64.apk", browser_download_url: `${REPO}/releases/download/v0.3.0/course-mngr-x86_64.apk` },
    { name: "course-mngr-arm64.APK", browser_download_url: `${REPO}/releases/download/v0.3.0/course-mngr-arm64.APK` }
  ]
});
same("多个 APK 时优先 arm64（扩展名大小写不敏感）", svc.pickInstallUrl(twoApks, true), `${REPO}/releases/download/v0.3.0/course-mngr-arm64.APK`);
same("非 github.com 的下载链接被丢掉", svc.parseRelease({ ...raw, assets: [{ name: "a.apk", browser_download_url: "https://evil.example/a.apk" }] }).assets, []);
same("非 github.com 的页面链接回退到仓库的 latest 页", svc.parseRelease({ ...raw, html_url: "https://evil.example/x" }).htmlUrl, `${REPO}/releases/latest`);
check("没有 tag_name 抛错", (await throwsMessage(() => svc.parseRelease({ html_url: raw.html_url }))) !== null);
check("不是对象也抛错而不是崩", (await throwsMessage(() => svc.parseRelease(null))) !== null);
same("UA 判断", [svc.isAndroidUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"), svc.isAndroidUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")], [true, false]);

// ---------- 取 Release：成功与各种失败 ----------
console.log("");
console.log("=== 取 Release：失败原因要说清楚 ===");
const jsonResponse = (status, body) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// 永远不回，直到被 abort —— 模拟连得上却没响应
const hangUntilAbort = (_url, init) =>
  new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
  });

let seen;
const ok = await svc.fetchLatestRelease({
  fetchImpl: async (url, init) => {
    seen = { url, accept: init.headers.Accept, hasSignal: !!init.signal };
    return jsonResponse(200, raw);
  }
});
same("成功：请求 latest 接口、带 Accept 和超时信号", seen, { url: "https://api.github.com/repos/orangeTZ07/Haust-Class-Schedule-APP/releases/latest", accept: "application/vnd.github+json", hasSignal: true });
same("成功：解析出 tag", ok.tag, "v0.3.0");

const fetchFailure = (fetchImpl, timeoutMs = 50) => throwsMessage(() => svc.fetchLatestRelease({ fetchImpl, timeoutMs }));

check("404 -> 还没有发布过正式版本", (await fetchFailure(async () => jsonResponse(404, { message: "Not Found" }))) === "GitHub 上还没有发布过正式版本");
check("403 -> 请求次数被限制", ((await fetchFailure(async () => jsonResponse(403, {}))) ?? "").includes("限制了请求次数"));
check("429 -> 请求次数被限制", ((await fetchFailure(async () => jsonResponse(429, {}))) ?? "").includes("限制了请求次数"));
check("500 -> 带上状态码", ((await fetchFailure(async () => jsonResponse(500, {}))) ?? "").includes("HTTP 500"));
{
  const message = (await fetchFailure(async () => { throw new TypeError("Failed to fetch"); })) ?? "";
  check("★ 断网/被拦 -> 保留浏览器给的原文", message.includes("无法连接到 GitHub") && message.includes("Failed to fetch"), message);
}
{
  const started = Date.now();
  const message = (await fetchFailure(hangUntilAbort, 50)) ?? "";
  check("★ 连得上但不回 -> 到时间就放弃并说是超时", message.includes("没有响应") && Date.now() - started < 2000, message);
}
{
  // 响应头来了，正文迟迟不来：计时器要一直盖到读完正文
  const stalledBody = (_url, init) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
    });
  const message = (await fetchFailure(stalledBody, 50)) ?? "";
  check("★ 正文迟迟不来也算超时", message.includes("没有响应"), message);
}
check("正文不是 JSON -> 说读不懂", ((await fetchFailure(async () => jsonResponse(200, "<html>oops</html>"))) ?? "").includes("读不懂"));
check("返回的不是 Release -> 说没有版本号", ((await fetchFailure(async () => jsonResponse(200, { message: "hi" }))) ?? "").includes("没有版本号"));
{
  // 成功后不能留着计时器：不清的话，8 秒后会对一个早已读完的请求发 abort，进程也要多挂 8 秒才能退出
  const timersBefore = process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
  await svc.fetchLatestRelease({ fetchImpl: async () => jsonResponse(200, raw), timeoutMs: 60_000 });
  const timersAfter = process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
  check("成功后清掉计时器", timersAfter === timersBefore, { timersBefore, timersAfter });
  await fetchFailure(async () => jsonResponse(404, {}), 60_000);
  check("失败后也清掉计时器", process.getActiveResourcesInfo().filter((name) => name === "Timeout").length === timersBefore);
}

console.log("");
console.log("=== 预览版抢先体验：偏好与取候选 ===");
{
  const mem = () => {
    const bag = new Map();
    return {
      getItem: (key) => (bag.has(key) ? bag.get(key) : null),
      setItem: (key, value) => bag.set(key, String(value)),
      removeItem: (key) => bag.delete(key)
    };
  };
  const store = mem();
  check("默认关闭", svc.isPreviewEarlyAccessEnabled(store) === false);
  same("存储键名", svc.PREVIEW_EARLY_ACCESS_STORAGE_KEY, "course-mngr-update-preview-early-access");
  svc.setPreviewEarlyAccessEnabled(true, store);
  check("打开后读到开", svc.isPreviewEarlyAccessEnabled(store) === true && store.getItem(svc.PREVIEW_EARLY_ACCESS_STORAGE_KEY) === "1");
  svc.setPreviewEarlyAccessEnabled(false, store);
  check("关掉后键拿掉", svc.isPreviewEarlyAccessEnabled(store) === false && store.getItem(svc.PREVIEW_EARLY_ACCESS_STORAGE_KEY) === null);

  const asRelease = (tag, extra = {}) => ({ tag, body: "", htmlUrl: `${REPO}/releases/tag/${tag}`, assets: [], ...extra });
  const picked = svc.pickNewestNewerRelease(
    [asRelease("v0.4.1-alpha.1"), asRelease("v0.4.0"), asRelease("v0.4.1-rc.1"), asRelease("v0.3.9")],
    "0.4.0"
  );
  same("开通道时挑最高的更新（rc 高于 alpha）", picked?.tag, "v0.4.1-rc.1");
  check("没有更高的就空", svc.pickNewestNewerRelease([asRelease("v0.3.9"), asRelease("v0.4.0")], "0.4.0") === null);
  check("已装预览时正式同号更高", svc.pickNewestNewerRelease([asRelease("v0.4.1")], "0.4.1-alpha.1")?.tag === "v0.4.1");

  const ls = mem();
  globalThis.localStorage = ls;

  const latestRaw = { ...raw, tag_name: "v0.4.0", html_url: `${REPO}/releases/tag/v0.4.0` };
  const listRaw = [
    { ...raw, tag_name: "v0.4.1-alpha.1", prerelease: true, html_url: `${REPO}/releases/tag/v0.4.1-alpha.1` },
    { ...raw, tag_name: "v0.4.0", prerelease: false, html_url: `${REPO}/releases/tag/v0.4.0` },
    { ...raw, tag_name: "v0.4.1-rc.1", prerelease: true, draft: false, html_url: `${REPO}/releases/tag/v0.4.1-rc.1` },
    { ...raw, tag_name: "v0.3.9", draft: true, html_url: `${REPO}/releases/tag/v0.3.9` }
  ];

  let hit;
  const offFound = await svc.fetchUpdateCandidate("0.3.9", {
    fetchImpl: async (url) => {
      hit = url;
      return jsonResponse(200, latestRaw);
    }
  });
  check("关通道只打 latest", hit === "https://api.github.com/repos/orangeTZ07/Haust-Class-Schedule-APP/releases/latest");
  same("关通道拿到正式最新", offFound?.tag, "v0.4.0");

  const noRollback = await svc.fetchUpdateCandidate("0.4.1-alpha.1", {
    fetchImpl: async () => jsonResponse(200, latestRaw)
  });
  check("关通道不会把已装预览滚回正式旧版", noRollback === null);

  svc.setPreviewEarlyAccessEnabled(true, ls);
  let listHit;
  const onFound = await svc.fetchUpdateCandidate("0.4.0", {
    fetchImpl: async (url) => {
      listHit = url;
      return jsonResponse(200, listRaw);
    }
  });
  check("开通道打 releases 列表", listHit === "https://api.github.com/repos/orangeTZ07/Haust-Class-Schedule-APP/releases");
  same("开通道挑最高预览", onFound?.tag, "v0.4.1-rc.1");
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
