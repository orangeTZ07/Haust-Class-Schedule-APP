// CAS 登录流程的断言。
//
// 核心思路：**不依赖你的密码、也不依赖连上学校** —— 把网络和加密都注入成假的，
// 用真实的登录页来验证"字段读对了没有"。今天出问题的地方正是字段，所以这里重点盯它。
//
// 用法: node scripts/test-cas-login.mjs

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const mod = await loadTs(join(here, "..", "src", "services", "eams", "casLogin.ts"));

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (!ok && detail !== undefined ? "   <- " + JSON.stringify(detail) : ""));
  if (!ok) failures++;
};

// ---------- 假网络层：真的去取登录页，但不发任何凭据 ----------
const liveFetch = (url) =>
  new Promise((done) => {
    const req = https.get(url, {
      timeout: 25000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
        Cookie: ""
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => done({
        status: res.statusCode,
        url,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("timeout", () => { req.destroy(); done({ status: 0, url, headers: {}, body: "" }); });
    req.on("error", () => done({ status: 0, url, headers: {}, body: "" }));
  });

console.log("=== 1. 用真实登录页验证字段解析 ===");
console.log("   （这是今天出问题的地方：漏了字段，服务端不知道用哪套登录方式）");

const live = await liveFetch(`${mod.CAS_URL}?service=${encodeURIComponent(mod.CAS_SERVICE)}`);

if (!live.body) {
  console.log("  SKIP  取不到登录页（网络不可达），只跑合成用例");
} else {
  console.log(`   登录页 ${live.body.length} 字符`);
  const form = mod.parseCasLoginForm(live.body);

  check("能解析出密码登录表单", !!form);
  if (form) {
    check("★ 取到的是密码表单（_eventId = submit）", form.fields["_eventId"] === "submit", form.fields["_eventId"]);
    check("★ 取到 currentMenu = 2（今天缺的就是它）", form.fields["currentMenu"] === "2", form.fields["currentMenu"]);
    check("execution 非空", typeof form.fields["execution"] === "string" && form.fields["execution"].length > 10, form.fields["execution"]);
    check("没有误取 drcom 那套", form.fields["_eventId"] !== "submitDrcomIPLogin");
    check("没有误取免密那套", form.fields["_eventId"] !== "submitPasswordlessToken");
    check("字段里含 username 与 password", "username" in form.fields && "password" in form.fields);
    // ★ 关键回归断言：绝不能把提交按钮一起发出去。
    //   这个 CAS 是 Struts 的，会按提交按钮的名字分派到不同的登录分支；同时带上三个，
    //   服务端就不知道走哪条路，把请求弹回登录页。能跑通的 Python 脚本从不发它们。
    const sent = Object.keys(form.fields);
    check("★ 没有发提交按钮 submit / submit1 / submit2",
      !sent.includes("submit") && !sent.includes("submit1") && !sent.includes("submit2"), sent);
    check("★ 没有发其它登录方式的字段",
      !sent.includes("drcomUsername") && !sent.includes("qrCodeKey") && !sent.includes("mfaState") && !sent.includes("_eventId_success"), sent);
    check("发的就是实测能通的那十来个字段", sent.length === 10, sent);
    console.log("   将发送的字段: " + sent.join(", "));
  }
}

console.log("");
console.log("=== 2. 合成用例：三套表单平铺时也要拿到密码那套的字段 ===");
// 页面是 Vue 渲染的，三套表单的 input 平铺在一起，不各自包在 <form> 里。
// execution 在真页面上三套同值 —— 这里照实情写成同一个，另外单列一个"取值不同"的用例。
const synthetic = `
<input type="hidden" name="execution" value="SAME-TOKEN"/>
<input type="hidden" name="_eventId" value="submitDrcomIPLogin"/>
<input type="hidden" name="currentMenu" value="1"/>
<input type="hidden" name="execution" value="SAME-TOKEN"/>
<input type="hidden" name="_eventId" value="submit"/>
<input type="hidden" name="currentMenu" value="2"/>
<input type="hidden" name="username" value=""/>
<input type="hidden" name="password" value=""/>
<input type="hidden" name="captcha" value=""/>
<input type="hidden" name="execution" value="SAME-TOKEN"/>
<input type="hidden" name="_eventId" value="submitPasswordlessToken"/>
<input type="hidden" name="currentMenu" value="3"/>`;
const picked = mod.parseCasLoginForm(synthetic);
check("拿到 execution", picked && picked.fields["execution"] === "SAME-TOKEN", picked && picked.fields["execution"]);
check("强制设为密码登录的 _eventId", picked && picked.fields["_eventId"] === "submit", picked && picked.fields["_eventId"]);
check("强制设为密码登录的 currentMenu=2", picked && picked.fields["currentMenu"] === "2", picked && picked.fields["currentMenu"]);
check("带上了 captcha", picked && "captcha" in picked.fields);
check("没有表单时返回 null", mod.parseCasLoginForm("<html>无表单</html>") === null);
check("三套同值时只报一个候选", picked && picked.executionCandidates.length === 1, picked && picked.executionCandidates);

// 取值不同时必须能被察觉，而不是静默取错
const differing = synthetic.replace(/value="SAME-TOKEN"/g, (m, i) => m).replace('name="execution" value="SAME-TOKEN"/>\n<input type="hidden" name="_eventId" value="submitPasswordlessToken"', 'name="execution" value="OTHER-TOKEN"/>\n<input type="hidden" name="_eventId" value="submitPasswordlessToken"');
const diffPicked = mod.parseCasLoginForm(differing);
check("取值不同时报出多个候选", diffPicked && diffPicked.executionCandidates.length === 2, diffPicked && diffPicked.executionCandidates);

console.log("");
console.log("=== 3. 失败原因必须分类（不能一律说'密码不对'，也不能误报）===");
const cases = [
  ["密码错", '<div>用户名或密码错误</div>', "学号或密码"],
  ["真要求验证码", "<div>请输入验证码</div>", "验证码"],
  ["锁定", "<div>失败次数过多，请稍后再试</div>", "锁定"],
  ["无法识别", "<html>出了点问题</html>", "没有给出可识别的原因"]
];
cases.forEach(([label, html, expect]) => {
  const r = mod.classifyLoginFailure(html, "https://cas.haust.edu.cn/cas/login", 200);
  check(`${label} -> 归类正确`, !r.ok && String(r.reason).includes(expect), r.reason);
});

// ★ 守着那个已经犯过一次的错误：页面上**永远存在** __captchaImgUrl（它是静态图片路径），
//   第一版把它当成了"现在需要验证码"，于是每次失败都误报成验证码，把真正的原因盖住了。
const falsePositive = mod.classifyLoginFailure(
  '<script>var __captchaImgUrl = "/cas/captcha.jpg";</script><html>未知情况</html>',
  "https://cas.haust.edu.cn/cas/login",
  200
);
check("★ 只有 __captchaImgUrl 时不得误报为验证码", !falsePositive.reason.includes("验证码"), falsePositive.reason);
check("★ 认不出来时如实说认不出来", falsePositive.reason.includes("没有给出可识别的原因"), falsePositive.reason);

check("无法识别时给出原文片段而不是猜", !!mod.classifyLoginFailure("<html>xyz</html>", "u", 200).detail);
check("诊断信息里带上了 HTTP 状态与最终地址", (() => {
  const d = JSON.parse(mod.classifyLoginFailure("<html>x</html>", "https://example.com/final", 500).detail);
  return d.status === 500 && d.finalUrl === "https://example.com/final" && typeof d.snippet === "string";
})(), mod.classifyLoginFailure("<html>x</html>", "https://example.com/final", 500).detail);

console.log("");
console.log("=== 4. cookie 必须自己管（http 插件不保存 cookie）===");
const jar = new mod.CookieJar();
jar.absorb({ status: 200, url: "u", headers: { "set-cookie": "JSESSIONID=abc123; Path=/; HttpOnly" }, body: "" });
check("吸收了 JSESSIONID", jar.header() === "JSESSIONID=abc123", jar.header());
jar.absorb({ status: 200, url: "u", headers: { "set-cookie": "CASTGC=tgt999; Path=/cas" }, body: "" });
check("多个 cookie 会累加", jar.header().includes("JSESSIONID=abc123") && jar.header().includes("CASTGC=tgt999"), jar.header());
check("多行 Set-Cookie 也能处理", (() => {
  const j = new mod.CookieJar();
  j.absorb({ status: 200, url: "u", headers: { "set-cookie": "a=1; Path=/, b=2; Path=/" }, body: "" });
  return j.header() === "a=1; b=2";
})(), "见上");

console.log("");
console.log("=== 5. 端到端：用假网络走一遍登录（不碰真实凭据）===");
{
  const jar2 = new mod.CookieJar();
  const calls = [];
  const fakeDeps = {
    http: {
      request: async (url, init) => {
        calls.push({ url, method: init?.method ?? "GET", hasCookie: !!init?.headers?.Cookie });
        if (init?.method === "POST") {
          // 模拟"成功"：最终落在统一门户
          return { status: 200, url: "https://i.haust.edu.cn/index", headers: {}, body: "<html>门户</html>" };
        }
        if (url.includes("publicKey")) {
          return { status: 200, url, headers: {}, body: "-----BEGIN PUBLIC KEY-----\nFAKE\n-----END PUBLIC KEY-----" };
        }
        return {
          status: 200,
          url,
          headers: { "set-cookie": "JSESSIONID=fake; Path=/" },
          body: synthetic
        };
      }
    },
    encryptPassword: async (password, key) => {
      if (!key.includes("BEGIN PUBLIC KEY")) throw new Error("公钥不对");
      return `__RSA__encrypted(${password})`;
    }
  };

  const result = await mod.casLogin(fakeDeps, jar2, "测试学号", "测试密码");
  check("成功路径返回 ok", result.ok === true, result);
  check("确实发了 POST", calls.some((c) => c.method === "POST"));
  // 不再手动发 Cookie：Tauri 的 http 插件按 fetch 规范把它列为禁止的请求头并静默丢弃，
  // 发了也是无用功。会话由插件自己的 cookie 罐维持（Cargo 默认特性 cookies）。
  check("没有手动发 Cookie 头", calls.every((c) => !c.hasCookie), calls.filter((c) => c.hasCookie).length);
  check("公钥地址被请求过", calls.some((c) => c.url.includes("publicKey")));
}

console.log("");
console.log("=== 6. 已经登录过的情况：不能再被误报成「页面结构变了」===");
// 用户在 aTrust 里登录过之后，请求 CAS 登录页会被直接跳到统一门户 —— 那种页面里当然没有登录
// 表单，但这不是"页面结构变了"，而是根本不需要再登录。第一版把两者混为一谈，于是用户无论密码
// 对错都看到同一句"找不到用户名密码表单"，毫无线索。
{
  const jar3 = new mod.CookieJar();
  const fakeDeps2 = {
    http: {
      request: async (url, init) => {
        if (url.includes("cas/login") && !init?.method) {
          // 直接落在门户上，内容是学校门户首页（标题就是「河南科技大学」）
          return {
            status: 200,
            url: "https://i.haust.edu.cn/portal/index",
            headers: {},
            body: '<!doctype html><html><head><title>河南科技大学</title></head><body>门户</body></html>'
          };
        }
        throw new Error("不该走到这里：" + url);
      }
    },
    encryptPassword: async () => "__RSA__x"
  };
  const trace = [];
  const r = await mod.casLogin(fakeDeps2, jar3, "u", "p", trace);
  check("★ 落在门户上 -> 判定为已登录（不是报错）", r.ok === true, r);
  check("★ 且没有去提交表单", trace.length === 1, trace.map((t) => t.step));
  check("轨迹里记下了实际拿到的标题", trace[0]?.title === "河南科技大学", trace[0]?.title);
}

console.log("");
console.log("=== 7. 拿到完全无关的页面时，诊断里要有地址与标题 ===");
{
  const jar4 = new mod.CookieJar();
  const fakeDeps3 = {
    http: {
      request: async () => ({
        status: 200,
        url: "https://cas.haust.edu.cn/somewhere-else",
        headers: {},
        body: '<html><head><title>某个别的页面</title></head><body>不是登录页</body></html>'
      })
    },
    encryptPassword: async () => "__RSA__x"
  };
  const trace = [];
  const r = await mod.casLogin(fakeDeps3, jar4, "u", "p", trace);
  check("不是登录页 -> 报错", r.ok === false);
  check("★ 诊断里带上了实际标题", String(r.detail).includes("某个别的页面"), r.detail);
  check("★ 诊断里带上了请求地址与最终地址", String(r.detail).includes("cas.haust.edu.cn") && String(r.detail).includes("落在"), r.detail);
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
