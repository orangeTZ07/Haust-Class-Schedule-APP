// 电池白名单：未豁免先弹系统对话框，已豁免或 OEM 没有弹窗再打开列表。
// 守的是用户选定的这条路径，不是「只打开设置列表」。
//
// 用法: node scripts/test-battery-whitelist.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const helper = readFileSync(
  join(root, "src-tauri/plugins/reminder/android/src/main/java/com/coursemngr/reminder/WhitelistHelper.kt"),
  "utf8"
);
const plugin = readFileSync(
  join(root, "src-tauri/plugins/reminder/android/src/main/java/com/coursemngr/reminder/ReminderPlugin.kt"),
  "utf8"
);
const manifest = readFileSync(
  join(root, "src-tauri/plugins/reminder/android/src/main/AndroidManifest.xml"),
  "utf8"
);
const settings = readFileSync(join(root, "src/views/settings/GridSettings.vue"), "utf8");
const reminder = readFileSync(join(root, "src/composables/useReminder.ts"), "utf8");

console.log("=== 一键请求，列表兜底 ===");
check(
  "未豁免走 REQUEST_IGNORE 对话框",
  helper.includes("ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS")
);
check(
  "对话框带本应用 package URI",
  helper.includes("package:${context.packageName}") || helper.includes("\"package:\"")
);
check(
  "已豁免或弹窗失败打开列表",
  helper.includes("ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS") &&
    helper.includes("requestIgnoreOrOpenList") &&
    helper.includes("isIgnoringBatteryOptimizations")
);
check(
  "底栏入口调用 requestIgnoreOrOpenList，不是只打开列表",
  plugin.includes("requestIgnoreOrOpenList") && !plugin.includes("openBatteryOptimizationSettings(context)")
);
check(
  "清单仍声明 REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  manifest.includes("android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS")
);
check(
  "清单仍声明 POST_NOTIFICATIONS，通知授权路径没有被拿走",
  manifest.includes("android.permission.POST_NOTIFICATIONS") &&
    reminder.includes("requestNotificationPermissionState")
);

console.log("=== 文案 ===");
const batteryBlock = settings.split("batteryExempt")[2] ?? "";
check("按钮是「去允许」，不再只写「去设置」", /去允许/.test(settings) && /onOpenBatteryWhitelist/.test(settings));
check("电池这一段不再用「去设置」当入口", !/openBatterySettings\">去设置/.test(batteryBlock) && !/@click=\"openBatterySettings\">去设置/.test(settings));

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n  ALL CHECKS PASSED");
