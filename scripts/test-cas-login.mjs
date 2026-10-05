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
    check("字段数量 > 5（说明是真的照搬了整个表单）", Object.keys(form.fields).length > 5, Object.keys(form.fields));
    console.log("   读到的字段: " + Object.keys(form.fields).join(", "));
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
console.log("=== 3. 失败原因必须分类（不能一律说'密码不对'）===");
const cases = [
  ["密码错", '<div>用户名或密码错误</div>', "学号或密码"],
  ["验证码", '<script>var __captchaImgUrl = "/cas/captcha.jpg";</script>', "验证码"],
  ["锁定", "<div>失败次数过多，请稍后再试</div>", "锁定"],
  ["无法识别", "<html>出了点问题</html>", "没有给出可识别的原因"]
];
cases.forEach(([label, html, expect]) => {
  const r = mod.classifyLoginFailure(html, "https://cas.haust.edu.cn/cas/login");
  check(`${label} -> 归类正确`, !r.ok && String(r.reason).includes(expect), r.reason);
});
check("无法识别时给出原文片段而不是猜", !!mod.classifyLoginFailure("<html>xyz</html>", "u").detail);

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
  check("POST 之后带上了 cookie", calls.find((c) => c.method === "POST")?.hasCookie === true);
  check("公钥地址被请求过", calls.some((c) => c.url.includes("publicKey")));
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
