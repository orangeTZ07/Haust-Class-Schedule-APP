// 取色环用到的颜色换算和几何的断言。
//
// 守的是这几件事：
//   1. 十六进制和 HSV 互转不丢信息。主题存的是 "#rrggbb"，取色环内部用 HSV，如果换算有误差，
//      用户选的色和存下的色会悄悄差一点，而且看不出来。
//   2. 手输的十六进制（带不带 #、三位、大小写）都能认，认不了的返回 null 而不是半个颜色。
//   3. 色环的命中判断和坐标换算：按在方块角上不能被当成色环，手柄位置要和点击位置互逆。
//
// 用法: node scripts/test-color.mjs

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const color = await loadTs(join(here, "..", "src", "utils", "color.ts"));
const wheel = await loadTs(join(here, "..", "src", "utils", "colorWheel.ts"));

let failures = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : `   <- 得到 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`));
  if (!ok) failures++;
};
const near = (name, actual, expected, eps = 1e-9) => {
  const ok = Math.abs(actual - expected) <= eps;
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : `   <- 得到 ${actual}，期望 ${expected}（误差上限 ${eps}）`));
  if (!ok) failures++;
};

console.log("=== 十六进制解析 ===");
check("#rrggbb", color.parseHex("#1989fa"), "#1989fa");
check("不带 #", color.parseHex("1989fa"), "#1989fa");
check("大写转小写", color.parseHex("#1989FA"), "#1989fa");
check("三位简写展开", color.parseHex("#f0a"), "#ff00aa");
check("三位简写不带 #", color.parseHex("0F8"), "#00ff88");
check("两侧空格忽略", color.parseHex("  #abcdef \n"), "#abcdef");
check("五位不认", color.parseHex("#12345"), null);
check("七位不认", color.parseHex("#1234567"), null);
check("非十六进制字符不认", color.parseHex("#12345g"), null);
check("空串不认", color.parseHex(""), null);
check("带透明度的八位不认（取色环只管 RGB）", color.parseHex("#11223344"), null);

console.log("");
console.log("=== 已知颜色 ===");
check("红 -> HSV", color.hexToHsv("#ff0000"), { h: 0, s: 1, v: 1 });
check("黄 -> HSV", color.hexToHsv("#ffff00"), { h: 60, s: 1, v: 1 });
check("绿 -> HSV", color.hexToHsv("#00ff00"), { h: 120, s: 1, v: 1 });
check("青 -> HSV", color.hexToHsv("#00ffff"), { h: 180, s: 1, v: 1 });
check("蓝 -> HSV", color.hexToHsv("#0000ff"), { h: 240, s: 1, v: 1 });
check("品红 -> HSV", color.hexToHsv("#ff00ff"), { h: 300, s: 1, v: 1 });
check("白 -> HSV", color.hexToHsv("#ffffff"), { h: 0, s: 0, v: 1 });
check("黑 -> HSV", color.hexToHsv("#000000"), { h: 0, s: 0, v: 0 });
check("HSV(210, 0.5, 0.5) -> 十六进制", color.hsvToHex({ h: 210, s: 0.5, v: 0.5 }), "#406080");
check("色相 360 等同 0", color.hsvToHex({ h: 360, s: 1, v: 1 }), "#ff0000");
check("色相 -60 等同 300", color.hsvToHex({ h: -60, s: 1, v: 1 }), "#ff00ff");

console.log("");
console.log("=== 往返：十六进制 -> HSV -> 十六进制，穷举全部 16,777,216 种颜色 ===");
{
  const t0 = Date.now();
  let bad = 0;
  let first = null;
  for (let n = 0; n < 0x1000000; n++) {
    const hex = "#" + n.toString(16).padStart(6, "0");
    const back = color.hsvToHex(color.hexToHsv(hex));
    if (back !== hex) {
      bad++;
      first ??= `${hex} -> ${back}`;
    }
  }
  check(`不一致的颜色个数（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`, bad, 0);
  if (bad) console.log("        第一个: " + first);
}

console.log("");
console.log("=== 往返：HSV -> RGB -> HSV（取色环状态不经过取整，应当几乎无损）===");
{
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let worstH = 0, worstS = 0, worstV = 0;
  for (let i = 0; i < 200000; i++) {
    const hsv = { h: rnd() * 360, s: 0.001 + rnd() * 0.999, v: 0.001 + rnd() * 0.999 };
    const back = color.rgbToHsv(color.hsvToRgb(hsv));
    const dh = Math.min(Math.abs(back.h - hsv.h), 360 - Math.abs(back.h - hsv.h));
    worstH = Math.max(worstH, dh);
    worstS = Math.max(worstS, Math.abs(back.s - hsv.s));
    worstV = Math.max(worstV, Math.abs(back.v - hsv.v));
  }
  near("色相最大误差（度）", worstH, 0, 1e-6);
  near("饱和度最大误差", worstS, 0, 1e-9);
  near("明度最大误差", worstV, 0, 1e-9);
}
check("灰色（s=0）转回来色相记 0，不是 NaN", color.rgbToHsv({ r: 128, g: 128, b: 128 }), { h: 0, s: 0, v: 128 / 255 });
check("纯黑不出 NaN", Number.isNaN(color.rgbToHsv({ r: 0, g: 0, b: 0 }).s), false);

console.log("");
console.log("=== 取色环：把色相从 0 扫到 360，每一度最多一个通道在变 ===");
{
  // 在 s = v = 1 上色相环是分段线性的：每一度只有一个通道在动。这能抓住扇区公式写错的情况。
  let ok = true;
  let prev = color.hexToRgb(color.hsvToHex({ h: 0, s: 1, v: 1 }));
  for (let h = 1; h <= 360; h++) {
    const cur = color.hexToRgb(color.hsvToHex({ h, s: 1, v: 1 }));
    if (["r", "g", "b"].filter((k) => cur[k] !== prev[k]).length > 1) ok = false;
    prev = cur;
  }
  check("每一度最多一个通道在变", ok, true);
  check("扫完一圈回到红", color.hsvToHex({ h: 360, s: 1, v: 1 }), "#ff0000");
}

console.log("");
console.log("=== 对比色（盖在色块上的文字用黑还是白）===");
check("白底用黑字", color.contrastColor("#ffffff"), "#000000");
check("黑底用白字", color.contrastColor("#000000"), "#ffffff");
check("深蓝底用白字", color.contrastColor("#1e1e2e"), "#ffffff");
check("浅黄底用黑字", color.contrastColor("#fdf6e3"), "#000000");
check("认不出的颜色不炸", color.contrastColor("nope"), "#000000");

console.log("");
console.log("=== 最近使用 ===");
check("新颜色放最前", color.pushRecent(["#111111", "#222222"], "#333333"), ["#333333", "#111111", "#222222"]);
check("重复的颜色挪到最前而不是出现两次", color.pushRecent(["#111111", "#222222", "#333333"], "#333333"), ["#333333", "#111111", "#222222"]);
check("大小写不同算同一个", color.pushRecent(["#abcdef"], "#ABCDEF"), ["#abcdef"]);
check("三位简写和六位算同一个", color.pushRecent(["#ffaa00"], "#fa0"), ["#ffaa00"]);
check(
  "最多 8 个，挤掉最老的",
  color.pushRecent(["#000001", "#000002", "#000003", "#000004", "#000005", "#000006", "#000007", "#000008"], "#000009"),
  ["#000009", "#000001", "#000002", "#000003", "#000004", "#000005", "#000006", "#000007"]
);
check("不是颜色的输入被忽略", color.pushRecent(["#111111"], "banana"), ["#111111"]);
check("原数组不被修改", (() => { const a = ["#111111"]; color.pushRecent(a, "#222222"); return a; })(), ["#111111"]);

console.log("");
console.log("=== 色环几何：命中判断 ===");
check("中心在方块里", wheel.hitZone(0.5, 0.5), "square");
check(
  "方块的四个角仍算方块，不会被当成色环",
  [wheel.hitZone(0.26, 0.26), wheel.hitZone(0.74, 0.26), wheel.hitZone(0.26, 0.74), wheel.hitZone(0.74, 0.74)],
  ["square", "square", "square", "square"]
);
check("环的正中间算色环", wheel.hitZone(0.5, 0.5 - 0.4325), "ring");
check("环外沿一点点（手指偏出去）还算色环", wheel.hitZone(0.5, 0.5 - 0.52), "ring");
check("环外沿太远不算", wheel.hitZone(0.5, 0.5 - 0.56), null);
check("盒子的角落在环外面", wheel.hitZone(0.02, 0.02), null);
check("贴着方块边外面一点，仍按方块算", wheel.hitZone(0.5 + 0.255, 0.5), "square");

console.log("");
console.log("=== 色环几何：坐标换算 ===");
near("正上方是 0 度", wheel.hueFromPoint(0.5, 0.1), 0);
near("正右方是 90 度", wheel.hueFromPoint(0.9, 0.5), 90);
near("正下方是 180 度", wheel.hueFromPoint(0.5, 0.9), 180);
near("正左方是 270 度", wheel.hueFromPoint(0.1, 0.5), 270);
near("右上 45 度方向是 45 度", wheel.hueFromPoint(0.7, 0.3), 45);
{
  let worst = 0;
  for (let h = 0; h < 360; h += 0.5) {
    const p = wheel.ringHandle(h);
    const back = wheel.hueFromPoint(p.x, p.y);
    worst = Math.max(worst, Math.min(Math.abs(back - h), 360 - Math.abs(back - h)));
  }
  near("色相 -> 手柄位置 -> 色相，最大误差（度）", worst, 0, 1e-9);
}
{
  let worst = 0;
  for (let s = 0; s <= 1; s += 0.05) for (let v = 0; v <= 1; v += 0.05) {
    const p = wheel.squareHandle(s, v);
    const back = wheel.svFromPoint(p.x, p.y);
    worst = Math.max(worst, Math.abs(back.s - s), Math.abs(back.v - v));
  }
  near("饱和度/明度 -> 手柄位置 -> 饱和度/明度，最大误差", worst, 0, 1e-12);
}
check("方块左上角是 饱和度 0、明度 1（白）", wheel.svFromPoint(0.26, 0.26), { s: 0, v: 1 });
check("方块右上角是 饱和度 1、明度 1（纯色）", wheel.svFromPoint(0.74, 0.26), { s: 1, v: 1 });
check("方块左下角是 明度 0（黑）", wheel.svFromPoint(0.26, 0.74).v, 0);
check("拖出方块被夹在边上", wheel.svFromPoint(2, -1), { s: 1, v: 1 });
{
  const p = wheel.ringHandle(123);
  near("手柄始终在环的中线上", Math.hypot(p.x - 0.5, p.y - 0.5), 0.4325, 1e-12);
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
