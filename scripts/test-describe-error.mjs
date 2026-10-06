// describeError 的断言。
//
// 守的是这个具体故障：Tauri 的 invoke 以「命令返回的错误值本身」拒绝 Promise，对 Err(String)
// 那是一个字符串。原来的 `${(e as Error).message}` 在字符串上取 .message 得到 undefined，
// 于是设置页把一次真实失败显示成字面的 "undefined"，白白多花一轮排查。
//
// 用法: node scripts/test-describe-error.mjs

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { describeError } = await loadTs(join(here, "..", "src", "utils", "describeError.ts"));

let failures = 0;
const check = (name, actual, expected) => {
  const ok = actual === expected;
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : `   <- 得到 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`));
  if (!ok) failures++;
};

console.log("=== 核心场景：Tauri 的字符串错误不能再变成 undefined ===");
check("字符串错误原样返回", describeError("invalid args `args` for command `set_reminder`"), "invalid args `args` for command `set_reminder`");
check("★ 字符串不会再产生 undefined", String(describeError("boom")).includes("undefined"), false);
check("中文错误原样返回", describeError("上课提醒仅在 Android 上可用"), "上课提醒仅在 Android 上可用");

console.log("");
console.log("=== 其它形态 ===");
check("Error 实例取 message", describeError(new Error("真实原因")), "真实原因");
check("带 message 的对象", describeError({ message: "对象里的原因" }), "对象里的原因");
check("无 message 的对象退化为 JSON", describeError({ code: 500, detail: "x" }), '{"code":500,"detail":"x"}');
check("空对象不产生空串", describeError({}), "[object Object]");
check("undefined 也给出可辨认文字", describeError(undefined), "undefined");
check("null 也给出可辨认文字", describeError(null), "null");
check("空字符串有兜底", describeError("   "), "(空字符串错误)");
check("数字", describeError(42), "42");

console.log("");
console.log("=== 对照：旧写法为什么会出问题 ===");
const old = (e) => `${e.message}`;
check("旧写法在字符串上得到 undefined", old("真实错误"), "undefined");
check("新写法得到真实错误", describeError("真实错误"), "真实错误");

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
