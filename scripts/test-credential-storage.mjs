// credentialStorage 的断言：学号密码存取往返、不勾「记住密码」不存密码、清除密码后学号还在、
// 存储里是坏 JSON 时读取不抛错。用内存假 storage，不碰真的 localStorage。
//
// 用法: node scripts/test-credential-storage.mjs

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { clearSavedPassword, readCredentials, saveCredentials } = await loadTs(
  join(here, "..", "src", "services", "eams", "credentialStorage.ts")
);

const KEY = "course-mngr-eams-credentials";

const memoryStorage = () => {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
    raw: (key) => items.get(key)
  };
};

let failures = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : `   <- 得到 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`));
  if (!ok) failures++;
};

console.log("=== 存取往返 ===");
{
  const storage = memoryStorage();
  check("没存过时读到 null", readCredentials(storage), null);
  saveCredentials("221404010101", "secret", true, storage);
  check("勾选后学号密码都读得回来", readCredentials(storage), {
    username: "221404010101",
    password: "secret",
    rememberPassword: true
  });
}

console.log("");
console.log("=== 不勾「记住密码」 ===");
{
  const storage = memoryStorage();
  saveCredentials("221404010101", "secret", true, storage);
  saveCredentials("221404010101", "secret", false, storage);
  check("只留学号", readCredentials(storage), { username: "221404010101", rememberPassword: false });
  check("存储原文里没有密码", storage.raw(KEY).includes("secret"), false);
}

console.log("");
console.log("=== 清除密码 ===");
{
  const storage = memoryStorage();
  saveCredentials("221404010101", "secret", true, storage);
  clearSavedPassword(storage);
  check("学号还在、密码没了", readCredentials(storage), { username: "221404010101", rememberPassword: false });
  check("存储原文里没有密码", storage.raw(KEY).includes("secret"), false);

  const empty = memoryStorage();
  clearSavedPassword(empty);
  check("没存过时清除不写入任何东西", empty.raw(KEY), undefined);
}

console.log("");
console.log("=== 损坏的数据 ===");
{
  const storage = memoryStorage();
  storage.setItem(KEY, "{not json");
  let thrown = false;
  let result;
  try {
    result = readCredentials(storage);
  } catch {
    thrown = true;
  }
  check("坏 JSON 不抛错", thrown, false);
  check("坏 JSON 读到 null", result, null);

  storage.setItem(KEY, JSON.stringify({ password: "secret" }));
  check("缺学号的记录读到 null", readCredentials(storage), null);

  storage.setItem(KEY, "{not json");
  clearSavedPassword(storage);
  check("坏 JSON 上清除密码不抛错，并删掉整条记录", storage.raw(KEY), undefined);
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
