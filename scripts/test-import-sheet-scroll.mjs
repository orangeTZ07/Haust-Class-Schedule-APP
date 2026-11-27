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
console.log("=== 导入面板能滑动（issue #53）===");
{
  const sheet = readFileSync(join(here, "..", "src/components/course/import/ImportSheet.vue"), "utf8");
  const markup = sheet.replace(/<!--[\s\S]*?-->/g, "");
  // vant 的锁滚动在 document 上记 touchstart；面板里 stopPropagation 会让它的起点永远是旧值，
  // 面板在顶部时任何滑动都被当成「往下」拦掉。
  check("面板里不再吞掉 touchstart", !/@touchstart\.stop/.test(markup));
  check("关掉 vant 的锁滚动，滚动交给 .sheet-body", sheet.includes(':lock-scroll="false"'));
  check(".sheet-body 自己挡住滚动链", /\.sheet-body \{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/.test(sheet));
  check("外层不带出系统回弹", /\.import-sheet \{[\s\S]*?overscroll-behavior: none;/.test(sheet));
  check("键盘弹起时收起底部开关，把高度让给表单", sheet.includes(":global(.kb-open .import-sheet .sheet-foot)"));
  const popups = readFileSync(join(here, "..", "src/styles/popups.css"), "utf8");
  check("键盘弹起时手势条留白归零", /\.kb-open \.app-sheet-safe \{\s*height: 0;/.test(popups));
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
console.log("=== 提示精简：一句话，细节折叠（issue #52）===");
{
  const eams = readFileSync(join(here, "..", "src/components/course/import/EamsSyncSection.vue"), "utf8");
  check("不再展示解析器的注意事项列表", !eams.includes("注意事项") && !eams.includes("report.notes"));
  check("失败只给一句原因，诊断信息单独收着", eams.includes('showMessage("err", result.message, result.detail ?? "")') && !eams.includes("诊断信息（请把这部分发给开发者）"));
  check("诊断信息默认收起、可复制", /const showDetail = ref\(false\)/.test(eams) && eams.includes('v-if="showDetail"') && eams.includes("copyFailureDetail"));
  check("没有进行中的提示框（按钮自己显示加载）", !eams.includes("正在连接教务系统") && !eams.includes("正在查询本学期考试安排"));
  check("只在需要处理时留在面板上", eams.includes("if (warnings.length === 0)") && eams.includes('emit("close")'));
  check(
    "提醒只有三类：节数超出、跳过课段、考试获取失败",
    eams.includes("periodOverflowNotice(") && eams.includes("skippedNotice(imported.skipped)") && eams.includes("考试安排获取失败")
  );
  check("节数提醒按当前网格判断，而不是写死 10 节", eams.includes("periodConfig.value.periods.length") && !eams.includes("maxPeriod > 10"));
}

console.log("");
console.log("=== 用户看得到的文案用正式措辞（issue #52）===");
{
  // 只扫字符串字面量，注释里的口语不影响用户。
  const stripComments = (src) =>
    src
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*\/\//.test(line))
      .join("\n");
  const literals = (src) =>
    [...stripComments(src).matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2]).join("\n");
  const userFacing = [
    "src/components/course/import/EamsSyncSection.vue",
    "src/components/course/import/AiImportSection.vue",
    "src/components/course/import/ImportSheet.vue",
    "src/components/course/import/importTable.ts",
    "src/services/eams/eamsClient.ts",
    "src/services/eams/examClient.ts"
  ];
  const casSrc = readFileSync(join(here, "..", "src/services/eams/casLogin.ts"), "utf8");
  const casReasons = [...casSrc.matchAll(/reason: ["`]([^"`]*)["`]/g)].map((m) => m[1]).join("\n");
  const text =
    userFacing.map((file) => literals(readFileSync(join(here, "..", file), "utf8"))).join("\n") + "\n" + casReasons;
  const colloquial = ["连不上", "发我", "发给我", "不对（", "说人话", "过不去", "没法", "不认这个会话", "结构变了", "本身出错", "爬虫", "课表是空的", "内容不能为空", "复制成功"];
  const hits = colloquial.filter((word) => text.includes(word));
  check("不含口语化措辞", hits.length === 0, hits);
  check("登录失败的原因都是一句完整的话", casReasons.split("\n").every((line) => /。$/.test(line)), casReasons);
}

console.log("");
console.log("=== 课表与考试一次同步（issue #51）===");
{
  const eams = readFileSync(join(here, "..", "src/components/course/import/EamsSyncSection.vue"), "utf8");
  check("只有一个同步按钮", eams.includes("同步课表与考试") && !eams.includes('"同步考试"') && !eams.includes("syncExams()") && !eams.includes("@click=\"syncExams\""));
  check("面板里不再放「查看考试安排」", !eams.includes("查看考试安排"));
  check("考试安排存到刚写入课表的那张表", eams.includes("syncExamsInto(activeCourseTableId.value"));
  check("课表之后取考试时跳过重复的连通性探测", eams.includes("skipReachabilityProbe: true"));
  const examClient = readFileSync(join(here, "..", "src/services/eams/examClient.ts"), "utf8");
  check("考试同步支持跳过探测", examClient.includes("if (!options.skipReachabilityProbe)"));
  const exams = readFileSync(join(here, "..", "src/views/ExamsView.vue"), "utf8");
  check("考试页的空状态说明随课表一并获取", exams.includes("同步课表时将一并获取"));
}

console.log("");
console.log("=== aTrust 提示可以跳转并复制地址 ===");
{
  const eams = readFileSync(join(here, "..", "src/components/course/import/EamsSyncSection.vue"), "utf8");
  const caps = readFileSync(join(here, "..", "src-tauri/capabilities/default.json"), "utf8");
  check("提示旁有打开 aTrust", eams.includes("打开 aTrust") && eams.includes("openAtrust"));
  check("复制的主机名是 vpn.haust.edu.cn", eams.includes('const VPN_HOST = "vpn.haust.edu.cn"') && eams.includes("copyVpnHost"));
  check(
    "优先用系统接口按包名拉起 aTrust",
    eams.includes('const ATRUST_PACKAGE = "com.sangfor.atrust"') && eams.includes("launchApp(ATRUST_PACKAGE)")
  );
  check(
    "没装 aTrust 就跳到安装说明页",
    eams.includes('const ATRUST_HELP_URL = "https://metic.haust.edu.cn/info/1010/1972.htm"') &&
      eams.includes("if (!launched) openAtrustHelp()")
  );
  check("系统浏览器放行安装说明页", caps.includes("https://metic.haust.edu.cn/info/1010/1972.htm"));
  // Android 11+ 的包可见性：清单里不声明，装了 aTrust 也查不到，会一直落到安装说明页。
  const installerDir = join(here, "..", "src-tauri/plugins/android-installer");
  const manifest = readFileSync(join(installerDir, "android/src/main/AndroidManifest.xml"), "utf8");
  const kotlin = readFileSync(
    join(installerDir, "android/src/main/java/dev/imal/tauri/androidinstaller/InstallerPlugin.kt"),
    "utf8"
  );
  check("清单里声明了能看见 aTrust 的包", /<queries>[\s\S]*<package android:name="com\.sangfor\.atrust"\s*\/>[\s\S]*<\/queries>/.test(manifest));
  check("原生端用 PackageManager 按包名取启动意图", kotlin.includes("getLaunchIntentForPackage"));
}

console.log("");
console.log(failed === 0 ? "  ALL CHECKS PASSED" : "  " + failed + " CHECK(S) FAILED");
process.exit(failed ? 1 : 0);
