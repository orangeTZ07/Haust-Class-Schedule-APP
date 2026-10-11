// 软键盘挡住的高度（utils/keyboardInset.ts）+ 接线：不打开界面。
//
// 这一条最怕的是"看着对"：键盘弹起时面板上移了，但数字算错（多扣一次、少扣一次、抖动也当键盘），
// 表现全是"面板位置怪怪的"。所以每个数都当场写死。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const kb = await loadTs(join(here, "..", "src/utils/keyboardInset.ts"));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const m = (innerHeight, viewportHeight, viewportOffsetTop = 0) => ({ innerHeight, viewportHeight, viewportOffsetTop });

console.log("=== 键盘挡住多高 ===");
{
  check("没有键盘 = 0", kb.keyboardInsetFrom(m(800, 800)) === 0, kb.keyboardInsetFrom(m(800, 800)));
  check("键盘 300 = 300", kb.keyboardInsetFrom(m(800, 500)) === 300, kb.keyboardInsetFrom(m(800, 500)));
  check("键盘 300 且视觉视口被顶掉 20 = 300（不重复扣 offsetTop）", kb.keyboardInsetFrom(m(800, 480, 20)) === 300, kb.keyboardInsetFrom(m(800, 480, 20)));
  check("地址栏抖动 12px = 0", kb.keyboardInsetFrom(m(800, 788)) === 0, kb.keyboardInsetFrom(m(800, 788)));
  check("刚好到阈值 40 = 40", kb.keyboardInsetFrom(m(800, 760)) === 40, kb.keyboardInsetFrom(m(800, 760)));
  check("小数取整（300.0）", kb.keyboardInsetFrom(m(800.4, 500.4)) === 300, kb.keyboardInsetFrom(m(800.4, 500.4)));
  check("视觉视口比布局还高 = 0", kb.keyboardInsetFrom(m(800, 900)) === 0, kb.keyboardInsetFrom(m(800, 900)));
  check("NaN = 0", kb.keyboardInsetFrom(m(NaN, 500)) === 0 && kb.keyboardInsetFrom(m(800, NaN)) === 0);
  check("Infinity = 0", kb.keyboardInsetFrom(m(Infinity, 500)) === 0 && kb.keyboardInsetFrom(m(800, 500, Infinity)) === 0);
  check("阈值常量与变量名（CSS 按这个名字读）", kb.MIN_KEYBOARD_PX === 40 && kb.KEYBOARD_INSET_VAR === "--kb-inset", [kb.MIN_KEYBOARD_PX, kb.KEYBOARD_INSET_VAR]);
}

console.log("");
console.log("=== 接线（读源码）===");
{
  const html = readFileSync(join(here, "..", "index.html"), "utf8");
  check("第一道保险：viewport 写了 interactive-widget=resizes-content", html.includes("interactive-widget=resizes-content"));

  const main = readFileSync(join(here, "..", "src/main.ts"), "utf8");
  check("main.ts 装了监听", main.includes("installKeyboardInset()") && main.includes('from "./composables/useKeyboardInset"'));

  const composable = readFileSync(join(here, "..", "src/composables/useKeyboardInset.ts"), "utf8");
  check("监听 visualViewport 的 resize 与 scroll", composable.includes('viewport.addEventListener("resize"') && composable.includes('viewport.addEventListener("scroll"'));
  check("数值没变就不写（键盘动画每帧 resize 不能让面板抖）", composable.includes("if (inset === last) return"));
  check("没有 visualViewport 时直接退出（桌面/旧 WebView 不留偏移）", composable.includes("!window.visualViewport"));

  const popups = readFileSync(join(here, "..", "src/styles/popups.css"), "utf8");
  check("底部面板整体上移", popups.includes("bottom: var(--kb-inset, 0px)"));

  const sheet = readFileSync(join(here, "..", "src/components/course/import/ImportSheet.vue"), "utf8");
  check("导入面板高度也封顶（不然头部会被顶出屏幕）", sheet.includes("max-height: min(88%, calc(100% - var(--kb-inset, 0px)))"));
  check("导入面板仍只有一层 van-popup", (sheet.match(/<van-popup/g) || []).length === 1);
}

console.log("");
console.log(failed === 0 ? "  ALL CHECKS PASSED" : "  " + failed + " CHECK(S) FAILED");
process.exit(failed ? 1 : 0);
