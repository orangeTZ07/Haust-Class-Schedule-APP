// 状态栏 / 导航栏图标颜色判断的断言。
//
// 守的是这个具体问题：原来图标深浅只跟「亮色 / 暗色模式」走，但模式并不等于栏后面的实际颜色。
// 「Vant 经典」是亮色模式，顶栏却是蓝底白字，状态栏压在蓝色上还画深色图标，几乎看不见。现在
// 改成看背景色的 WCAG 相对亮度；颜色解析不了才退回按模式判断。
//
// 用法: node scripts/test-bar-icon-color.mjs

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { parseColor, relativeLuminance, wantsDarkIcons, LIGHT_BACKGROUND_LUMINANCE } = await loadTs(
  join(here, "..", "src", "utils", "barIconColor.ts")
);

let failures = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, actual, expected) => {
  const ok = same(actual, expected);
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : `   <- 得到 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`));
  if (!ok) failures++;
};
const near = (name, actual, expected, tolerance = 0.002) => {
  const ok = Math.abs(actual - expected) <= tolerance;
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : `   <- 得到 ${actual}，期望约 ${expected}`));
  if (!ok) failures++;
};

console.log("=== 颜色解析 ===");
check("#fff", parseColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
check("#RRGGBB 大小写不敏感", parseColor("#1989FA"), { r: 25, g: 137, b: 250, a: 1 });
check("#rgba 简写带透明度", parseColor("#0008"), { r: 0, g: 0, b: 0, a: 0x88 / 255 });
check("#rrggbbaa", parseColor("#11223380"), { r: 17, g: 34, b: 51, a: 0x80 / 255 });
check("rgb() 逗号写法", parseColor("rgb(255, 0, 10)"), { r: 255, g: 0, b: 10, a: 1 });
check("rgba() 带小数透明度", parseColor("rgba(0, 0, 0, 0.5)"), { r: 0, g: 0, b: 0, a: 0.5 });
check("空格写法加 / 透明度", parseColor("rgb(255 0 0 / 50%)"), { r: 255, g: 0, b: 0, a: 0.5 });
check("通道写百分比", parseColor("rgb(100%, 0%, 50%)"), { r: 255, g: 0, b: 127.5, a: 1 });
check("通道超范围被夹住", parseColor("rgb(300, -5, 0)"), { r: 255, g: 0, b: 0, a: 1 });
check("前后空白和大写", parseColor("  RGB(1,2,3)  "), { r: 1, g: 2, b: 3, a: 1 });
check("颜色名不猜", parseColor("red"), null);
check("hsl() 不解析", parseColor("hsl(0, 100%, 50%)"), null);
check("var() 不解析", parseColor("var(--theme-bg-color)"), null);
check("空串", parseColor(""), null);
check("长度不对的十六进制", parseColor("#12345"), null);
check("rgb 缺通道", parseColor("rgb(1, 2)"), null);
check("rgb 通道不是数字", parseColor("rgb(1, 2, x)"), null);
check("非字符串", parseColor(undefined), null);
check("null", parseColor(null), null);

console.log("");
console.log("=== WCAG 相对亮度（参考值来自规范公式）===");
near("白 = 1", relativeLuminance(parseColor("#ffffff")), 1, 1e-9);
near("黑 = 0", relativeLuminance(parseColor("#000000")), 0, 1e-9);
near("#808080 ≈ 0.2159", relativeLuminance(parseColor("#808080")), 0.2159);
near("纯红 = 0.2126", relativeLuminance(parseColor("#ff0000")), 0.2126, 1e-9);
near("纯绿 = 0.7152", relativeLuminance(parseColor("#00ff00")), 0.7152, 1e-9);
near("纯蓝 = 0.0722", relativeLuminance(parseColor("#0000ff")), 0.0722, 1e-9);
near("Vant 蓝 #1989fa ≈ 0.25", relativeLuminance(parseColor("#1989fa")), 0.25, 0.01);

console.log("");
console.log("=== 阈值 ===");
check("阈值是 0.5", LIGHT_BACKGROUND_LUMINANCE, 0.5);
check("#bcbcbc 刚过 0.5 -> 深色图标", wantsDarkIcons("#bcbcbc", false), true);
check("#bbbbbb 刚不到 0.5 -> 浅色图标", wantsDarkIcons("#bbbbbb", true), false);

console.log("");
console.log("=== ★ 核心场景：按背景色定，不按模式 ===");
// 这几组是 useTheme.ts 里真实的预设值（headerBgColor / bgColor）。
check("Vant 经典：亮色模式，蓝顶栏 #1989fa -> 浅色图标", wantsDarkIcons("#1989fa", /* 亮色模式的回退 */ true), false);
check("Vant 经典：页面底 #ffffff -> 深色图标", wantsDarkIcons("#ffffff", false), true);
check("默认亮色：顶栏 #e6e9ef -> 深色图标", wantsDarkIcons("#e6e9ef", false), true);
check("默认亮色：页面 #eff1f5 -> 深色图标", wantsDarkIcons("#eff1f5", false), true);
check("默认暗色：顶栏 #181825 -> 浅色图标", wantsDarkIcons("#181825", true), false);
check("默认暗色：页面 #1e1e2e -> 浅色图标", wantsDarkIcons("#1e1e2e", true), false);
check("极简白 #ffffff -> 深色图标", wantsDarkIcons("#ffffff", false), true);
check("极简黑 #000000 -> 浅色图标", wantsDarkIcons("#000000", true), false);
check("马卡龙顶栏 #fdf2f8 -> 深色图标", wantsDarkIcons("#fdf2f8", false), true);
check("樱花顶栏 #fff1f2 -> 深色图标", wantsDarkIcons("#fff1f2", false), true);
check("日光 #fdf6e3 -> 深色图标", wantsDarkIcons("#fdf6e3", false), true);
check("霓虹极客顶栏 #2e1065 -> 浅色图标", wantsDarkIcons("#2e1065", true), false);
check("深海 #0f172a -> 浅色图标", wantsDarkIcons("#0f172a", true), false);
check("丛林 #022c22 -> 浅色图标", wantsDarkIcons("#022c22", true), false);
check("德古拉 #282a36 -> 浅色图标", wantsDarkIcons("#282a36", true), false);
check("复古 #282828 -> 浅色图标", wantsDarkIcons("#282828", true), false);
check("北欧极地 #2e3440 -> 浅色图标", wantsDarkIcons("#2e3440", true), false);
check("亮色模式里放一块深色背景 -> 仍然浅色图标（不看模式）", wantsDarkIcons("#101010", true), false);
check("暗色模式里放一块浅色背景 -> 仍然深色图标（不看模式）", wantsDarkIcons("#f0f0f0", false), true);

console.log("");
console.log("=== 解析不了就退回按模式 ===");
check("颜色名 + 亮色模式 -> 深色图标", wantsDarkIcons("red", true), true);
check("颜色名 + 暗色模式 -> 浅色图标", wantsDarkIcons("red", false), false);
check("undefined + 亮色模式", wantsDarkIcons(undefined, true), true);
check("空串 + 暗色模式", wantsDarkIcons("", false), false);
check("var() + 亮色模式", wantsDarkIcons("var(--x)", true), true);

console.log("");
console.log("=== 半透明背景要叠在后面的颜色上看 ===");
check("rgba(0,0,0,0.1) 默认叠在白上 -> 仍然很亮 -> 深色图标", wantsDarkIcons("rgba(0,0,0,0.1)", false), true);
check("rgba(0,0,0,0.1) 叠在黑上 -> 很暗 -> 浅色图标", wantsDarkIcons("rgba(0,0,0,0.1)", true, "#000000"), false);
check("rgba(255,255,255,0.1) 叠在黑上 -> 仍然很暗 -> 浅色图标", wantsDarkIcons("rgba(255,255,255,0.1)", true, "#000"), false);
check("rgba(255,255,255,0.9) 叠在黑上 -> 很亮 -> 深色图标", wantsDarkIcons("rgba(255,255,255,0.9)", false, "#000"), true);
check("完全透明 -> 取决于后面（黑）-> 浅色图标", wantsDarkIcons("rgba(0,0,0,0)", true, "#000000"), false);
check("后面的颜色解析不了 -> 当作白", wantsDarkIcons("rgba(0,0,0,0.1)", false, "red"), true);
check("后面的颜色自己也半透明 -> 先叠在白上", wantsDarkIcons("rgba(0,0,0,0.5)", false, "rgba(0,0,0,0)"), false);
check("不透明背景忽略 behind", wantsDarkIcons("#ffffff", false, "#000000"), true);

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
