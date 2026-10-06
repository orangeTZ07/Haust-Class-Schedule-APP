// 验证 jsencrypt 产出的密文确实是合法的 RSA PKCS#1 v1.5 —— 用自己生成的密钥对它做解密。
//
// 为什么必须先验证这个：学校用 PKCS#1 v1.5 加密密码，而**浏览器的 WebCrypto 只支持 OAEP**，
// 两者不通用。所以只能引第三方库。而"引了库、看起来能跑"和"产出的密文学校真的能解开"是两回事 ——
// 后者错了，表现就是"登录失败"，而且会被误判成密码错（今天已经这样被带偏过一次）。
//
// 做法：本地生成一对密钥 -> 用 jsencrypt 加密 -> 用私钥解密 -> 明文一致即证明格式正确。
//
// 用法: node scripts/test-rsa-encrypt.mjs

import { generateKeyPairSync, privateDecrypt, constants } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (!ok && detail !== undefined ? "   <- " + JSON.stringify(detail) : ""));
  if (!ok) failures++;
};

// jsencrypt 是给浏览器写的，会用到 window / self / navigator / crypto。
// 这些在 Tauri 的 webview 里本来就都有；这里只是给 Node 补上，让同一份应用代码能在本地被测。
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
if (typeof globalThis.navigator === "undefined") globalThis.navigator = { userAgent: "node" };

console.log("=== 1. 加载加密实现（应用代码，经 esbuild 打包）===");
// 直接 import("jsencrypt") 在 Node 的 ESM 下会失败 —— 它内部的引用不带扩展名。
// 但打包器能正常解析，所以应用里没问题；测试这边走 esbuild 打包后再加载，与应用的路径一致。
const { encryptPasswordWithKey, RSA_PREFIX } = await loadTs(
  join(here, "..", "src", "services", "eams", "rsaEncrypt.ts")
);
check("加密实现能加载", typeof encryptPasswordWithKey === "function", typeof encryptPasswordWithKey);
check("前缀是 __RSA__", RSA_PREFIX === "__RSA__", RSA_PREFIX);
console.log("");
console.log("=== 2. 用本地密钥验证：加密 -> 用私钥解密 ===");

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

const password = "我的密码 abc-123-!@#";
const wrapped = encryptPasswordWithKey(password, publicKey);
check("加密有输出", typeof wrapped === "string" && wrapped.length > 0, typeof wrapped);

const cipher = typeof wrapped === "string" && wrapped.startsWith(RSA_PREFIX) ? wrapped.slice(RSA_PREFIX.length) : null;
check("带上了 __RSA__ 前缀", !!cipher, wrapped && wrapped.slice(0, 12));

if (cipher) {
  const decrypted = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(cipher, "base64")
  ).toString("utf8");

  check("★ 用 RSA_PKCS1_PADDING 能解开（证明就是 PKCS#1 v1.5）", decrypted === password, decrypted);
  check("密文长度 = 模长 256 字节", Buffer.from(cipher, "base64").length === 256, Buffer.from(cipher, "base64").length);

  console.log("");
  console.log("=== 3. 对照：换用 OAEP 应该解不开（说明 WebCrypto 那套不通用）===");
  let oaepWorked = false;
  try {
    privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(cipher, "base64"));
    oaepWorked = true;
  } catch {
    oaepWorked = false;
  }
  check("PKCS#1 v1.5 的密文用 OAEP 解不开", !oaepWorked, oaepWorked);
}

console.log("");
console.log("=== 4. 用学校的真实公钥试一次（不需要密码）===");
const https = await import("node:https");
const pub = await new Promise((done) => {
  https.default.get("https://cas.haust.edu.cn/cas/jwt/publicKey", { timeout: 20000 }, (res) => {
    let b = "";
    res.on("data", (c) => (b += c));
    res.on("end", () => done(b.trim()));
  }).on("error", () => done(""));
});

if (!pub) {
  console.log("  SKIP  取不到学校公钥（网络不可达）");
} else {
  console.log(`   学校公钥 ${pub.length} 字符`);
  check("公钥是 PEM 格式", pub.includes("BEGIN") && pub.includes("KEY"), pub.slice(0, 40));

  const out = encryptPasswordWithKey("测试", pub);
  check("★ 用学校公钥加密成功（未报错）", typeof out === "string" && out.length > 0, typeof out);
  if (out) {
    const raw = out.slice(RSA_PREFIX.length);
    check("密文长度符合 2048 位模长", Buffer.from(raw, "base64").length === 256, Buffer.from(raw, "base64").length);
    check("输出是合法 base64", /^[A-Za-z0-9+/]+=*$/.test(raw));
    console.log("   （无法进一步验证 —— 解开它需要学校的私钥。但格式对了，密码就进得去。）");
  }
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
