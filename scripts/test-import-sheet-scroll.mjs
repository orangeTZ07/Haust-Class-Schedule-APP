// 导入面板的滚动相关接线：通知不再和用户抢滑动、底部面板挂到 body、报告不再是一屏文字墙。
//
// 这几条都是"看源码能验、跑界面验不了"的东西（真机上的滑动要人工看），所以钉在这里，防止以后
// 有人顺手把 scrollIntoView / user-select / 就地渲染改回来。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

console.log("=== 通知不再和用户抢滑动 ===");
{
  const notice = readFileSync(join(here, "..", "src/components/course/import/ImportNotice.vue"), "utf8");
  check("只在文字真的变了才滚动", notice.includes("if (!text || text === lastText.value) return"));
  check(
    "用 nearest + 即时滚动（不再用 smooth 把正在看的一屏拽回顶部）",
    notice.includes('scrollIntoView({ block: "nearest" })') && !notice.includes('behavior: "smooth"')
  );
  check("默认不可选中（整屏文字上按住会进文字选择，纵向滑动就被吃掉）", /\.notice \{[\s\S]*?user-select: none/.test(notice));
  check("出错那种仍可选中复制（诊断信息要能发给开发者）", notice.includes(".notice.err {") && notice.includes("user-select: text"));
}

console.log("");
console.log("=== 底部面板不再落在带 transform 的层里 ===");
{
  const sheets = [
    ["src/components/course/import/ImportSheet.vue", "import-sheet"],
    ["src/components/timetable/PeriodTimeSheet.vue", "period-sheet"],
    ["src/views/settings/GridSettings.vue", "app-popup--sheet"]
  ];
  for (const [file, label] of sheets) {
    const src = readFileSync(join(here, "..", file), "utf8");
    check(`${label} 挂到 body`, src.includes('teleport="body"'));
  }
}

console.log("");
console.log("=== 报告不再是一屏文字墙 ===");
{
  const eams = readFileSync(join(here, "..", "src/components/course/import/EamsSyncSection.vue"), "utf8");
  check("注意事项默认收起", /const showNotes = ref\(false\)/.test(eams));
  check("点开才铺出来", eams.includes('v-if="showNotes"'));
  check("收起时给出条数", eams.includes("注意事项 {{ notes.length }} 条"));
  check("报告本体只留状态与真要处理的提醒", eams.includes("skippedNotice(imported.skipped)") && !eams.includes("...noteLines"));
}

console.log("");
console.log("=== aTrust 提示可以跳转并复制地址 ===");
{
  const eams = readFileSync(join(here, "..", "src/components/course/import/EamsSyncSection.vue"), "utf8");
  const caps = readFileSync(join(here, "..", "src-tauri/capabilities/default.json"), "utf8");
  check("提示旁有打开 aTrust", eams.includes("打开 aTrust") && eams.includes("openAtrust"));
  check("复制的主机名是 vpn.hasut.edu.cn", eams.includes('const VPN_HOST = "vpn.hasut.edu.cn"') && eams.includes("copyVpnHost"));
  check("打开的是这台 aTrust 的入口", eams.includes("const ATRUST_URL = `https://${VPN_HOST}/`"));
  check("系统浏览器放行这个地址", caps.includes("https://vpn.hasut.edu.cn/") && caps.includes("https://vpn.hasut.edu.cn/**"));
}

console.log("");
console.log(failed === 0 ? "  ALL CHECKS PASSED" : "  " + failed + " CHECK(S) FAILED");
process.exit(failed ? 1 : 0);
