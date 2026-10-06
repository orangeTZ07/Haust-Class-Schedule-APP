// 白金 / 黑金 / 网易云红 / B站粉 只注册在预设表里，颜色和现有预设走同一套对比。

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const theme = await loadTs(join(here, "..", "src/composables/useTheme.ts"));
const accent = await loadTs(join(here, "..", "src/utils/themeAccent.ts"));

const expected = {
  白金: { mode: "light", headerBgColor: "#9AA3B2", headerTextColor: "#374151", bgColor: "#F4F5F7", cardBorderColor: "#C5CAD3", accent: "#374151" },
  黑金: { mode: "dark", headerBgColor: "#D4AF37", headerTextColor: "#0F0F12", bgColor: "#0F0F12", cardBorderColor: "#3D3420", accent: "#D4AF37" },
  网易云红: { mode: "light", headerBgColor: "#EC4141", headerTextColor: "#ffffff", bgColor: "#FFF5F5", cardBorderColor: "#F0B4B4", accent: "#EC4141" },
  "B站粉": { mode: "light", headerBgColor: "#FB7299", headerTextColor: "#374151", bgColor: "#FFF0F5", cardBorderColor: "#F5C0D0", accent: "#374151" }
};

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const parse = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (hex) => {
  const [r, g, b] = parse(hex);
  const ch = (v) => {
    const u = v / 255;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const contrast = (a, b) => {
  const lighter = Math.max(lum(a), lum(b));
  const darker = Math.min(lum(a), lum(b));
  return (lighter + 0.05) / (darker + 0.05);
};

console.log("=== 四个新预设 ===");
for (const [id, colors] of Object.entries(expected)) {
  const entry = theme.presetList.find((item) => item.id === id && item.name === id);
  check(`${id} 在预设表里`, !!entry, entry?.id);
  if (!entry) continue;
  const preset = entry.preset;
  check(`${id} 主色是表头底`, preset.headerBgColor === colors.headerBgColor, preset.headerBgColor);
  check(`${id} 表头字`, preset.headerTextColor === colors.headerTextColor, preset.headerTextColor);
  check(`${id} 背景`, preset.bgColor === colors.bgColor, preset.bgColor);
  check(`${id} 课程边框`, preset.cardBorderColor === colors.cardBorderColor, preset.cardBorderColor);
  check(`${id} 明暗`, preset.mode === colors.mode, preset.mode);
  const bodyOnPage = contrast(preset.bodyTextColor, preset.bgColor);
  check(`${id} 正文对比至少 4.5`, bodyOnPage >= 4.5, bodyOnPage.toFixed(2));
  const headerPair = contrast(preset.headerTextColor, preset.headerBgColor);
  check(`${id} 表头字和表头底至少 3:1`, headerPair >= 3, headerPair.toFixed(2));
  const picked = accent.pickAccent(preset);
  check(`${id} 标记色`, picked.accent.toLowerCase() === colors.accent.toLowerCase(), picked);
}

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n  ALL CHECKS PASSED");
