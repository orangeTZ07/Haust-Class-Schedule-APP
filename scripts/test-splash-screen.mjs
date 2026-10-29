// 启动屏（index.html 的 #app-splash）+ 退场逻辑（utils/splash.ts）：不打开界面。
//
// 启动屏的 bug 有一类特别难在真机上复现：数据快的时候闪一下、数据慢的时候永远不消失、
// 开了"减少动态效果"的用户被 320ms 的淡出留在原地。所以这里把时序和接线都钉死。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const splash = await loadTs(join(root, "src/utils/splash.ts"));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 一张假的 DOM：只提供 splash.ts 用到的那几个接口。 */
function stubDom({ reduceMotion = false } = {}) {
  const calls = { add: [], remove: 0 };
  let node = {
    classList: { add: (name) => calls.add.push(name) },
    remove: () => {
      calls.remove++;
      node = null;
    },
  };
  globalThis.document = {
    getElementById: (id) => (id === "app-splash" ? node : null),
  };
  globalThis.window = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    matchMedia: () => ({ matches: reduceMotion }),
  };
  return calls;
}

console.log("=== 常量 ===");
{
  check("最短可见 900ms", splash.MIN_VISIBLE_MS === 900, splash.MIN_VISIBLE_MS);
  check("淡出 320ms", splash.FADE_MS === 320, splash.FADE_MS);
  check("兜底等待 6000ms", splash.MAX_SPLASH_MS === 6000, splash.MAX_SPLASH_MS);
  check("淡出时长不超过最短可见时间的一半（不然像卡顿）", splash.FADE_MS <= splash.MIN_VISIBLE_MS / 2, [splash.FADE_MS, splash.MIN_VISIBLE_MS]);
}

console.log("");
console.log("=== 退场时序 ===");
{
  const calls = stubDom();
  splash.hideAppSplash(1e9); // 已经超过最短可见时间：立刻开始淡出
  await sleep(30);
  check("立刻加上 is-leaving", calls.add.includes("is-leaving"), calls.add);
  check("淡出期间节点还在", calls.remove === 0, calls.remove);
  await sleep(splash.FADE_MS + 120);
  check("淡完移除节点", calls.remove === 1, calls.remove);
}
{
  const calls = stubDom({ reduceMotion: true });
  splash.hideAppSplash(1e9);
  await sleep(30);
  check("减少动态效果：不淡出，直接移除", calls.remove === 1 && !calls.add.includes("is-leaving"), { remove: calls.remove, add: calls.add });
}
{
  const calls = stubDom();
  splash.hideAppSplash(0); // 刚出现就调用：必须先等满最短可见时间
  await sleep(120);
  check("最短可见时间内一动不动", calls.add.length === 0 && calls.remove === 0, { add: calls.add, remove: calls.remove });
  await sleep(splash.MIN_VISIBLE_MS + 80);
  check("到点后才开始淡出", calls.add.includes("is-leaving"), calls.add);
}
{
  const calls = stubDom();
  const savedDoc = globalThis.document;
  globalThis.document = { getElementById: () => null }; // 节点不存在（比如已经撤过）
  let threw = false;
  try {
    splash.hideAppSplash(1e9);
    await sleep(30);
  } catch (e) {
    threw = true;
  }
  check("节点不存在时静默返回", !threw && calls.remove === 0, { threw, remove: calls.remove });
  globalThis.document = savedDoc;
}
{
  const calls = stubDom();
  let threw = false;
  try {
    splash.hideAppSplash(1e9);
    splash.hideAppSplash(1e9); // 重复调用（HMR / 路由重挂）不能报错
    await sleep(splash.FADE_MS + 160);
  } catch (e) {
    threw = true;
  }
  // 两次调用各自排一个 remove；DOM 里对已移除节点再 remove 是空操作，这里只要求"不报错、节点最终没了"
  check("重复调用不报错、节点最终被移除", !threw && calls.remove >= 1, { threw, remove: calls.remove });
}

console.log("");
console.log("=== 接线（读源码）===");
{
  const html = readFileSync(join(root, "index.html"), "utf8");
  const theme = readFileSync(join(root, "src/composables/useTheme.ts"), "utf8");
  const app = readFileSync(join(root, "src/App.vue"), "utf8");
  const util = readFileSync(join(root, "src/utils/splash.ts"), "utf8");

  check("index.html 里有启动屏节点", html.includes('id="app-splash"'));
  check("启动屏节点在 #app 之前（Vue 挂载不会顶掉它）", html.indexOf('id="app-splash"') < html.indexOf('id="app"'));
  check("启动屏节点 aria-hidden（纯装饰，屏幕阅读器跳过）", /id="app-splash"[^>]*aria-hidden="true"/.test(html));
  check(
    "图标走 public/ 静态资源（相对路径，base 改了也不 404）",
    /src="\.?\/?splash-icon\.png"/.test(html) && existsSync(join(root, "public/splash-icon.png")),
  );
  check("样式内联在 index.html（CSS 包没到也能画）", html.includes("#app-splash {"));
  check("首帧前按主题定底色", html.includes("course-mngr-theme") && html.includes("--splash-bg"));
  check("读的存储键和 useTheme 一致", theme.includes('const STORAGE_KEY = "course-mngr-theme"') && html.includes('localStorage.getItem("course-mngr-theme")'));
  check("底色取 bgColor（自定义预设也能对上）", html.includes("cfg.bgColor"));
  check("暗色 / 亮色两套瓦片阴影", html.includes("--splash-tile-shadow"));
  check("淡出类", html.includes("#app-splash.is-leaving"));
  check("淡出时长和 splash.ts 对齐", html.includes("opacity 320ms ease") && util.includes("export const FADE_MS = 320"));
  check("尊重减少动态效果", html.includes("prefers-reduced-motion") && util.includes("prefers-reduced-motion: reduce"));
  check("尺寸跟着窗口短边走（vmin）", html.includes("clamp(88px, 27vmin, 148px)") && html.includes("clamp(19px, 5.4vmin, 30px)"));
  check("App.vue 引了 hideAppSplash", app.includes("hideAppSplash") && app.includes('from "./utils/splash"'));
  check("App.vue 等 coursesReady 才撤启动屏", app.includes("coursesReady"));
  check("App.vue 有 6 秒兜底（读库卡住也要进得去）", app.includes("MAX_SPLASH_MS") && app.includes("Promise.race"));
  check("读库失败也撤启动屏（catch 后照常 hide）", app.includes("coursesReady.catch"));
}

console.log("");
console.log("=== 图标资源 ===");
{
  const { readFileSync: rf } = await import("node:fs");
  const buf = rf(join(root, "public/splash-icon.png"));
  check("是 PNG（89 50 4E 47）", buf[0] === 0x89 && buf.subarray(1, 4).toString() === "PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  check("分辨率够（>= 256，2 倍屏不糊）", width >= 256 && height >= 256, [width, height]);
  check("体积可控（< 200KB）", buf.length < 200 * 1024, buf.length);
}

console.log("");
console.log(failed === 0 ? "  ALL CHECKS PASSED" : "  " + failed + " CHECK(S) FAILED");
process.exit(failed ? 1 : 0);
