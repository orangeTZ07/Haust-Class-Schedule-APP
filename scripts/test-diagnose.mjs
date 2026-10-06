// diagnose.ts 的断言 —— 逐跳跟随。
//
// 这一块是上一轮真正出错的地方：我传了插件不存在的 `redirect: "manual"`，插件静默忽略、
// 自己跟完了跳转，于是我看到的 403 是**最后一跳**的结果，却标成了"第 1 跳"，还据此下结论。
// 所以这里的断言必须守住两件事：
//   1. 请求真的带上了 `maxRedirections: 0`（否则插件又会自己跳，我们只能看到最后一跳）；
//   2. 中间的 403 必须记在它真正发生的那一跳上，而不是被合并成"第一跳"。
//
// 用法: node scripts/test-diagnose.mjs

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
if (typeof globalThis.navigator === "undefined") globalThis.navigator = { userAgent: "node" };

const here = dirname(fileURLToPath(import.meta.url));
const mod = await loadTsModule(join(here, "..", "src", "services", "eams", "diagnose.ts"));

async function loadTsModule(p) {
  const { loadTs } = await import("./load-ts.mjs");
  return loadTs(p);
}

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (!ok && detail !== undefined ? "   <- " + JSON.stringify(detail).slice(0, 220) : ""));
  if (!ok) failures++;
};

/// 造一个按剧本走的假服务器。
/// routes: { "路径": { status, location? , body?, setCookie? } }
const makeHttp = (routes, record) => ({
  request: async (url, init) => {
    record.push({ url, maxRedirections: init?.maxRedirections, origin: init?.headers?.Origin, headers: init?.headers });
    const path = new URL(url).pathname + new URL(url).search;
    const hit = routes[path];
    if (!hit) throw new Error("剧本里没有这一跳: " + path);
    return {
      status: hit.status,
      url,
      headers: {
        ...(hit.location ? { location: hit.location } : {}),
        ...(hit.setCookie ? { "set-cookie": "JSESSIONID=x" } : {})
      },
      body: hit.body ?? ""
    };
  }
});

console.log("=== 1. 逐跳跟随：中间跳必须留下痕迹 ===");
{
  const record = [];
  const http = makeHttp(
    {
      "/eams/login.action": { status: 302, location: "/eams/loginExt.action;jsessionid=ABC" },
      "/eams/loginExt.action;jsessionid=ABC": { status: 200, body: "<html><head><title>统一身份认证登录</title></head></html>", setCookie: true }
    },
    record
  );

  const hops = await mod.walkHopChain(http, "https://jwgl.haust.edu.cn/eams/login.action");

  check("走了两跳", hops.length === 2, hops.length);
  check("第 1 跳状态 302", hops[0]?.status === 302, hops[0]?.status);
  check("第 2 跳状态 200", hops[1]?.status === 200, hops[1]?.status);
  // ★ 相对 Location 必须被解析成绝对地址，否则第 2 跳会请求到拼错的地址上
  check("★ 相对 Location 被解析成绝对地址",
    hops[0]?.location === "https://jwgl.haust.edu.cn/eams/loginExt.action;jsessionid=ABC", hops[0]?.location);
  check("第 2 跳请求的是解析后的地址", hops[1]?.url === hops[0]?.location, hops[1]?.url);
  check("跳转那一跳不显示正文（避免误导）", hops[0]?.bodyStart === undefined, hops[0]?.bodyStart);
  check("第 2 跳记录了标题", hops[1]?.title === "统一身份认证登录", hops[1]?.title);
  check("第 2 跳记录了 Set-Cookie 存在", hops[1]?.setCookie === true, hops[1]?.setCookie);
}

console.log("");
console.log("=== 2. ★ 每次请求都必须带 maxRedirections: 0（不带插件就会自己跳）===");
{
  const record = [];
  const http = makeHttp(
    {
      "/eams/login.action": { status: 302, location: "/next" },
      "/next": { status: 302, location: "/final" },
      "/final": { status: 403, body: "" }
    },
    record
  );
  await mod.walkHopChain(http, "https://jwgl.haust.edu.cn/eams/login.action");
  check("★ 每一跳都传了 maxRedirections: 0", record.length === 3 && record.every((r) => r.maxRedirections === 0),
    record.map((r) => r.maxRedirections));
}

console.log("");
console.log("=== 3. ★ 403 发生在第 3 跳，就必须记在第 3 跳（这正是上一轮被标错的地方）===");
{
  const record = [];
  const http = makeHttp(
    {
      "/eams/login.action": { status: 302, location: "/next" },
      "/next": { status: 302, location: "/final" },
      "/final": { status: 403, body: "" }
    },
    record
  );
  const hops = await mod.walkHopChain(http, "https://jwgl.haust.edu.cn/eams/login.action");
  check("一共 3 跳", hops.length === 3, hops.length);
  check("第 1 跳是 302（不是 403）", hops[0]?.status === 302, hops[0]?.status);
  check("★ 403 记在第 3 跳上", hops[2]?.status === 403, hops.map((h) => h.status));
  check("★ 第 3 跳的地址是 /final", hops[2]?.url.endsWith("/final"), hops[2]?.url);
}

console.log("");
console.log("=== 4. 第一跳就被拒时，确实就是第一跳 ===");
{
  const record = [];
  const http = makeHttp({ "/eams/login.action": { status: 403, body: "" } }, record);
  const hops = await mod.walkHopChain(http, "https://jwgl.haust.edu.cn/eams/login.action");
  check("只有 1 跳", hops.length === 1, hops.length);
  check("第 1 跳就是 403", hops[0]?.status === 403, hops[0]?.status);
  check("没有 Location", hops[0]?.location === undefined, hops[0]?.location);
}

console.log("");
console.log("=== 5. 三个变体只差该差的那一个变量 ===");
{
  const names = mod.VARIANTS.map((v) => v.name);
  check("有 A/B/C 三个变体", names.length === 3, names);
  check("A 不改任何头", Object.keys(mod.VARIANTS[0].headers).length === 0, mod.VARIANTS[0].headers);
  check("B 只改 Origin", Object.keys(mod.VARIANTS[1].headers).join() === "Origin", mod.VARIANTS[1].headers);
  check("★ B 的 Origin 是空串（插件据此移除该头）", mod.VARIANTS[1].headers.Origin === "", mod.VARIANTS[1].headers);
  check("C 也移除 Origin", mod.VARIANTS[2].headers.Origin === "", mod.VARIANTS[2].headers);
  check("C 补了 Sec-Fetch-*", !!mod.VARIANTS[2].headers["Sec-Fetch-Mode"], mod.VARIANTS[2].headers);
}

console.log("");
console.log("=== 6. 变体真的把各自的头传下去了 ===");
{
  const record = [];
  const http = makeHttp({ "/eams/login.action": { status: 403, body: "" } }, record);
  await mod.runDiagnosticMatrix(http, "https://jwgl.haust.edu.cn/eams/login.action");
  check("一共发了 3 次请求", record.length === 3, record.length);
  check("A 的 Origin 不是空串", record[0].origin !== "", record[0].origin);
  check("★ B 传了 Origin: 空串", record[1].origin === "", record[1].origin);
  check("C 带了 Sec-Fetch-Mode", record[2].headers?.["Sec-Fetch-Mode"] === "navigate", record[2].headers);
}

console.log("");
console.log("=== 7. 发不出去（异常）和「被拒绝」必须分开说 ===");
{
  const http = { request: async () => { throw new Error("模拟：连不上"); } };
  const results = await mod.runDiagnosticMatrix(http, "https://jwgl.haust.edu.cn/eams/login.action");
  check("三个变体都记录了", results.length === 3, results.length);
  check("★ 说成「发不出去」而不是「被拒绝」", results.every((r) => r.verdict.includes("发不出去")), results[0].verdict);
  check("且附上了原始错误", results[0].verdict.includes("连不上"), results[0].verdict);
}

console.log("");
console.log("=== 8. formatMatrix 必须把每跳的地址与 Location 都写出来 ===");
{
  const record = [];
  const http = makeHttp(
    {
      "/eams/login.action": { status: 302, location: "/next" },
      "/next": { status: 403, body: "" }
    },
    record
  );
  const results = await mod.runDiagnosticMatrix(http, "https://jwgl.haust.edu.cn/eams/login.action");
  const text = mod.formatMatrix(results);
  check("含变体名", text.includes("A · 现状"), text.slice(0, 60));
  check("含第 1 跳的请求地址", text.includes("https://jwgl.haust.edu.cn/eams/login.action"));
  check("含 Location", text.includes("Location → https://jwgl.haust.edu.cn/next"));
  check("含第 2 跳的状态", text.includes("HTTP 403"));
  check("两跳都标了序号", text.includes("第 1 跳") && text.includes("第 2 跳"));
}

console.log("");
console.log("=== 9. ★ 修复本身：默认请求头必须移除 Origin（设备实测的结论）===");
// 设备上的诊断矩阵给出的结果，同一台手机、同一网络、逐跳记录：
//   带 Origin     -> 第 1 跳 HTTP 403
//   不发 Origin   -> 第 1 跳 302 -> 第 2 跳 200（拿到「河南科技大学教学管理系统」）
// 所以"默认不带 Origin"就是修复本身，必须被断言守住。
{
  const { BROWSER_HEADERS } = await loadTsModule(join(here, "..", "src", "services", "eams", "browserHeaders.ts"));
  check("★ Origin 是空串（插件约定的'移除该头'写法）", BROWSER_HEADERS.Origin === "", BROWSER_HEADERS.Origin);
  check("带了浏览器 User-Agent", /Mozilla/.test(BROWSER_HEADERS["User-Agent"] ?? ""), BROWSER_HEADERS["User-Agent"]);
  check("带了 Accept 与 Accept-Language", !!BROWSER_HEADERS.Accept && !!BROWSER_HEADERS["Accept-Language"]);
  // 实测：加了 Accept-Encoding 之后拿回来的是压缩正文，而插件不解压，正文变乱码。
  check("★ 没有 Accept-Encoding（加了会拿到压缩后没人解的乱码）", !("Accept-Encoding" in BROWSER_HEADERS), Object.keys(BROWSER_HEADERS));
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
