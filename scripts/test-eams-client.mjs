// 完整同步链路的回放测试。
//
// 做法：把真实抓下来的响应（dump_*.html）当成"服务器返回的东西"，注入进假网络层，然后跑
// fetchTimetable 走完整条链路：探连通 → CAS 登录 → RSA 加密 → SSO → 解析请求参数 → 拉课表 → 解析。
//
// 所以这个测试断言的不是某个函数，而是**"同步一次会得到什么"** —— 12 门课 / 39 条日程，
// 以及线性代数B 那两条。周次按下标计（跳过下标 0）：周一第 1-13 周、周五第 1-13 周的单周。
//
// 真实响应不入仓库（含个人课表），缺失时自动跳过并说明。
//
// 用法: node scripts/test-eams-client.mjs [dump 目录]

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dumpDir = process.argv[2] || "D:/Deepseek/Harness/haust-spider";

if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
if (typeof globalThis.navigator === "undefined") globalThis.navigator = { userAgent: "node" };

const { fetchTimetable } = await loadTs(join(here, "..", "src", "services", "eams", "eamsClient.ts"));
const { encryptPasswordWithKey } = await loadTs(join(here, "..", "src", "services", "eams", "rsaEncrypt.ts"));

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (!ok && detail !== undefined ? "   <- " + JSON.stringify(detail).slice(0, 240) : ""));
  if (!ok) failures++;
};

const COURSE_PAGE = join(dumpDir, "dump_jwgl.haust.edu.cn_coursepage.html");
const COURSE_TABLE = join(dumpDir, "dump_jwgl.haust.edu.cn_coursetable.html");

if (!existsSync(COURSE_PAGE) || !existsSync(COURSE_TABLE)) {
  console.log("=== 跳过：找不到真实响应 ===");
  console.log("  需要：" + COURSE_PAGE);
  console.log("        " + COURSE_TABLE);
  console.log("  （含个人课表，不入仓库；缺失时这个测试不运行。）");
  process.exit(0);
}

// 取一份真实的 CAS 登录页当"服务器的登录页"。它是公开页面，可以直接联网拿。
const liveGet = (url) =>
  new Promise((done) => {
    https.get(url, { timeout: 25000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" } }, (res) => {
      const cs = [];
      res.on("data", (c) => cs.push(c));
      res.on("end", () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(cs).toString("utf8") }));
    }).on("error", () => done({ status: 0, headers: {}, body: "" }));
  });

console.log("=== 准备回放素材 ===");
const coursePageHtml = readFileSync(COURSE_PAGE, "utf8");
const courseTableHtml = readFileSync(COURSE_TABLE, "utf8");
console.log(`  课表页   ${coursePageHtml.length} 字符`);
console.log(`  课表响应 ${courseTableHtml.length} 字符`);

const casPage = await liveGet("https://cas.haust.edu.cn/cas/login?service=https%3A%2F%2Fi.haust.edu.cn%2F");
const publicKey = await liveGet("https://cas.haust.edu.cn/cas/jwt/publicKey");
console.log(`  CAS 登录页 ${casPage.body.length} 字符（${casPage.body ? "实取" : "取不到，登录部分会跳过"}）`);
console.log(`  学校公钥   ${publicKey.body.trim().length} 字符`);

/// 假网络层：按 URL 决定返回什么，并在登录成功时让最终 URL 落在统一门户。
const makeReplayHttp = (options = {}) => {
  const seen = [];
  const http = {
    request: async (url, init) => {
      const method = init?.method ?? "GET";
      seen.push({ url, method, cookie: init?.headers?.Cookie ?? "" });

      if (options.failReachability && url.includes("/eams/login.action")) {
        throw new Error("模拟：连不上主机");
      }
      // 真服务器对 /eams/login.action 返回 302 跳到 loginExt.action（带 jsessionid）。
      // 这里必须照实模拟：探测现在会检查状态码，用 404 冒充会让整条回放被误判成"连不上"。
      if (url.includes("/eams/login.action") && method === "GET") {
        return { status: 302, url: url.replace("/login.action", "/loginExt.action;jsessionid=REPLAY"), headers: {}, body: "" };
      }
      if (url.includes("/cas/jwt/publicKey")) {
        return { status: 200, url, headers: {}, body: publicKey.body };
      }
      if (url.includes("/cas/login")) {
        if (method === "POST") {
          if (options.loginFails) {
            // 服务端把你弹回登录页，并在页面里写明原因
            return {
              status: 200,
              url: "https://cas.haust.edu.cn/cas/login?service=x",
              headers: {},
              body: '<div>用户名或密码错误</div>'
            };
          }
          return { status: 200, url: "https://i.haust.edu.cn/index", headers: {}, body: "<html>门户</html>" };
        }
        return { status: 200, url, headers: { "set-cookie": "JSESSIONID=replay; Path=/" }, body: casPage.body };
      }
      if (url.includes("/eams/sso/login.action")) {
        return { status: 200, url, headers: {}, body: "<html>eams</html>" };
      }
      if (url.includes("courseTableForStd.action")) {
        if (options.paramsMissing) {
          return { status: 200, url, headers: {}, body: "<html>页面结构变了，没有 ids</html>" };
        }
        return { status: 200, url, headers: {}, body: coursePageHtml };
      }
      if (url.includes("courseTableForStd!courseTable.action")) {
        if (options.tableEmpty) {
          return { status: 200, url, headers: {}, body: "<html>没有 TaskActivity</html>" };
        }
        return { status: 200, url, headers: {}, body: courseTableHtml };
      }
      return { status: 404, url, headers: {}, body: "" };
    }
  };
  return { http, seen };
};

const deps = (http) => ({ http, encryptPassword: async (pw, key) => encryptPasswordWithKey(pw, key) ?? "__RSA__failed" });

console.log("");
console.log("=== 1. 完整同步（回放真实响应）===");
{
  const { http, seen } = makeReplayHttp();
  const result = await fetchTimetable(deps(http), "测试学号", "测试密码");

  check("同步成功", result.ok === true, result.ok ? undefined : result);

  if (result.ok) {
    check("★ 12 门课程", result.backup.courses.length === 12, result.backup.courses.length);
    check("★ 39 条日程", result.backup.schedules.length === 39, result.backup.schedules.length);

    const lin = result.backup.courses.filter((c) => c.name === "线性代数B");
    check("线性代数B 只有一门", lin.length === 1, lin.length);
    if (lin.length) {
      const sched = result.backup.schedules.filter((s) => s.courseId === lin[0].id);
      const summary = sched.map((s) => `周${s.dayOfWeek} ${s.startWeek}-${s.endWeek}/${s.weekType}`).sort();
      // 下标即周次、跳过下标 0。旧期望「周1 2-14/all | 周5 2-14/even」是 i+1 推后一周的结果。
      check(
        "★ 线性代数B 周一第 1-13 周、周五第 1-13 周单周",
        summary.join(" | ") === "周1 1-13/all | 周5 1-13/odd",
        summary
      );
    }
    check("数据库原理只合并成一门", result.backup.courses.filter((c) => c.name === "数据库原理").length === 1);
    check("最大节次 11 被报告出来", result.report.maxPeriod === 11, result.report.maxPeriod);
  }

  check("请求顺序合理：先探连通再登录", seen[0]?.url.includes("/eams/login.action"), seen[0]?.url);
  // **不**手动发 Cookie 头 —— Tauri 的 http 插件按 fetch 规范把它列为禁止的请求头并静默丢弃，
  // 所以写了也是无用功（这一点是查插件 Rust 源码确认的，不是猜的）。会话由插件的 cookie 罐维持。
  check("没有手动发 Cookie 头（发了也会被静默丢弃）", seen.every((s) => !s.cookie), seen.filter((s) => s.cookie).map((s) => s.url));
  check("登录后的请求确实发生了", seen.filter((s) => s.url.includes("/eams/")).length >= 3, seen.length);
}

console.log("");
console.log("=== 2. 失败路径必须归类正确（不能一律说密码错）===");
{
  const r = await fetchTimetable(deps(makeReplayHttp({ failReachability: true }).http), "u", "p");
  check("连不上 -> kind=unreachable", !r.ok && r.kind === "unreachable", r);
  check("且提示里提到 aTrust", !r.ok && r.message.includes("aTrust"), !r.ok ? r.message : "");
}
{
  const r = await fetchTimetable(deps(makeReplayHttp({ loginFails: true }).http), "u", "p");
  check("密码错 -> kind=login", !r.ok && r.kind === "login", r);
  check("且说清了是密码问题", !r.ok && r.message.includes("密码"), !r.ok ? r.message : "");
}
{
  const r = await fetchTimetable(deps(makeReplayHttp({ paramsMissing: true }).http), "u", "p");
  check("参数缺失 -> kind=params", !r.ok && r.kind === "params", r);
}
{
  const r = await fetchTimetable(deps(makeReplayHttp({ tableEmpty: true }).http), "u", "p");
  check("课表空 -> kind=empty", !r.ok && r.kind === "empty", r);
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
