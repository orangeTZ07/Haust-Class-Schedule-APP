// 周次错位提示与操作引导的纯逻辑。不打开界面。
//
// 用法: node scripts/test-week-offset-and-coach.mjs

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const prompt = await loadTs(join(here, "..", "src", "utils", "weekOffsetPrompt.ts"));
const coach = await loadTs(join(here, "..", "src", "utils", "featureCoach.ts"));

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (!ok && detail !== undefined ? "   <- " + JSON.stringify(detail) : ""));
  if (!ok) failures++;
};

const memory = () => {
  const bag = new Map();
  return {
    getItem: (key) => (bag.has(key) ? bag.get(key) : null),
    setItem: (key, value) => bag.set(key, String(value))
  };
};

console.log("=== 重新导入提示（不改数据）===");
{
  check("空课表不提示", prompt.semesterNeedsReimport([]) === false);
  check("只有单周改动不提示", prompt.semesterNeedsReimport([
    { scope: "weekly", startWeek: 3, endWeek: 3, weekType: "all" }
  ]) === false);
  check("第 1 周有学期课不提示", prompt.semesterNeedsReimport([
    { scope: "semester", startWeek: 1, endWeek: 16, weekType: "all" }
  ]) === false);
  check("从第 2 周开始才提示", prompt.semesterNeedsReimport([
    { scope: "semester", startWeek: 2, endWeek: 17, weekType: "all" }
  ]) === true);
  check("混有第 1 周就不提示", prompt.semesterNeedsReimport([
    { scope: "semester", startWeek: 2, endWeek: 16, weekType: "all" },
    { scope: "semester", startWeek: 1, endWeek: 8, weekType: "all" }
  ]) === false);
  check("单周覆盖层不算第 1 周有课", prompt.semesterNeedsReimport([
    { scope: "semester", startWeek: 2, endWeek: 16, weekType: "all" },
    { scope: "weekly", startWeek: 1, endWeek: 1, weekType: "all" }
  ]) === true);

  const store = memory();
  check("没问过", prompt.wasReimportPrompted(3, store) === false);
  prompt.markReimportPrompted(3, store);
  check("这张课表问过一次", prompt.wasReimportPrompted(3, store) === true);
  check("另一张课表还可以问", prompt.wasReimportPrompted(4, store) === false);
  check("文案提醒覆盖会清掉单周改动", prompt.WEEK_OFFSET_PROMPT.message.includes("覆盖") && prompt.WEEK_OFFSET_PROMPT.message.includes("清掉"));
}

console.log("");
console.log("=== 引导步骤 ===");
{
  const fresh = coach.autoCoachQueue({ seenIds: null, hasCoursesOnCurrentWeek: false });
  check("第一次打开不加「新功能」", fresh.every((step) => step.prefixNew === false));
  check("没课先不出现双击加课", fresh.every((step) => step.id !== "double-tap-empty-add-v1"));
  check("没课也不出现删除", fresh.every((step) => step.id !== "delete-course-v1"));
  check("第一次仍介绍调整节次时间、菜单、导入、外观和节次时间", fresh.map((step) => step.id).join(",") === "adjust-period-time-v1,menu-reopen-guide-v1,import-from-menu-v1,appearance-settings-v1,period-timing-settings-v3", fresh.map((step) => step.id));

  const withCourses = coach.autoCoachQueue({ seenIds: null, hasCoursesOnCurrentWeek: true });
  check("有课才把双击加课放进来", withCourses[0]?.id === "double-tap-empty-add-v1" && withCourses[0].prefixNew === false);
  check("删除紧跟在双击加课后面", withCourses[1]?.id === "delete-course-v1");
  check("删除步骤指课程块", withCourses[1]?.target === "course-block");
  check("长按调时间紧跟删除，在菜单之前", withCourses[2]?.id === "adjust-period-time-v1" && withCourses[3]?.id === "menu-reopen-guide-v1");
  check("长按调时间指课表左侧节次时间，在主屏，不用等有课", withCourses[2]?.target === "period-time" && withCourses[2]?.offHome === false && withCourses[2]?.requiresCoursesOnCurrentWeek === false);
  check(
    "长按调时间的锁定文案",
    withCourses[2]?.title === "调整节次时间" &&
      withCourses[2]?.body === "长按课表左侧的节次时间，可以改这一节的上下课时间。同一时段里后面的节次会跟着平移，午休和晚饭时间不动。"
  );
  check(
    "删除文案讲手势和范围对话框",
    withCourses[1]?.body.includes("垃圾桶") && withCourses[1]?.body.includes("整学期") && withCourses[1]?.body.includes("仅当前周")
  );
  check("旧步骤 id 没改名", withCourses.some((step) => step.id === "double-tap-empty-add-v1") && withCourses.some((step) => step.id === "menu-reopen-guide-v1"));

  const later = coach.autoCoachQueue({
    seenIds: ["menu-reopen-guide-v1", "import-from-menu-v1"],
    hasCoursesOnCurrentWeek: true
  });
  check("只补没看过的步骤", later.map((step) => step.id).join(",") === "double-tap-empty-add-v1,delete-course-v1,adjust-period-time-v1,appearance-settings-v1,period-timing-settings-v3");
  check("补看的步骤带「新功能」", later.every((step) => step.prefixNew === true));

  // 看完旧版引导（旧课时步骤 id 为 v1）的人，只会补看新增的两步：长按调时间和改过文案的节次时间。
  const finishedOldGuide = coach.autoCoachQueue({
    seenIds: ["double-tap-empty-add-v1", "delete-course-v1", "menu-reopen-guide-v1", "import-from-menu-v1", "appearance-settings-v1", "period-timing-settings-v1"],
    hasCoursesOnCurrentWeek: true
  });
  check("看完旧引导的人补看新两步", finishedOldGuide.map((step) => step.id).join(",") === "adjust-period-time-v1,period-timing-settings-v3" && finishedOldGuide.every((step) => step.prefixNew === true), finishedOldGuide.map((step) => step.id));
  check("节次时间改了文案和指向，旧 id 不再复用", !coach.COACH_STEPS.some((step) => step.id === "period-timing-settings-v1" || step.id === "period-timing-settings-v2"));
  const finishedListGuide = coach.autoCoachQueue({
    seenIds: ["double-tap-empty-add-v1", "delete-course-v1", "adjust-period-time-v1", "menu-reopen-guide-v1", "import-from-menu-v1", "appearance-settings-v1", "period-timing-settings-v2"],
    hasCoursesOnCurrentWeek: true
  });
  check("看过逐节列表那一版的人，补看简化后的上课时间", finishedListGuide.map((step) => step.id).join(",") === "period-timing-settings-v3" && finishedListGuide[0]?.prefixNew === true, finishedListGuide.map((step) => step.id));

  const done = coach.autoCoachQueue({
    seenIds: coach.COACH_STEPS.map((step) => step.id),
    hasCoursesOnCurrentWeek: true
  });
  check("都看过就不再自动出现", done.length === 0);

  const manual = coach.manualCoachQueue();
  check("菜单重开是全部步骤且不加前缀", manual.length === coach.COACH_STEPS.length && manual.every((step) => step.prefixNew === false));
  check("操作指南一共七步", manual.length === 7 && manual[1]?.id === "delete-course-v1" && manual[2]?.id === "adjust-period-time-v1" && manual[5]?.id === "appearance-settings-v1");
  check("导入不在主屏", manual.find((step) => step.id === "import-from-menu-v1")?.offHome === true);
  check("外观在导入之后", manual.map((step) => step.id).indexOf("appearance-settings-v1") === manual.map((step) => step.id).indexOf("import-from-menu-v1") + 1);
  check("节次时间紧跟外观", manual.find((step) => step.id === "period-timing-settings-v3")?.target === "period-timing" && manual.map((step) => step.id).indexOf("period-timing-settings-v3") === manual.map((step) => step.id).indexOf("appearance-settings-v1") + 1);
  check("设置页的两步仍排在最后，首个设置步骤是外观", coach.firstSettingsCoachIndex(manual) === 5 && manual[6]?.id === "period-timing-settings-v3");
  check("外观文案不提主题名", manual.find((step) => step.id === "appearance-settings-v1")?.title === "外观" && manual.find((step) => step.id === "appearance-settings-v1")?.body === "在设置里可以换预设主题，也可以自己设背景图。");
  check("上课时间文案是锁定句", manual.find((step) => step.id === "period-timing-settings-v3")?.title === "上课时间" && manual.find((step) => step.id === "period-timing-settings-v3")?.body === "上午、下午、晚课几点开始，还有每节时长，都在这里改。单独改某一节，长按课表左侧的时间。");
  check("引导文案不再提已删除的「课间间隔」「每节课时长」", !manual.some((step) => step.body.includes("课间间隔") || step.body.includes("每节课时长")));
  check("没有抢先体验引导步", !manual.some((step) => step.id.includes("preview") || (step.body && step.body.includes("抢先体验"))));
  const home = readFileSync(join(here, "..", "src/views/HomeView.vue"), "utf8");
  check("跟进设置是 router.push 而不是停在侧栏", home.includes("SETTINGS_COACH_PATH") && home.includes("router.push(SETTINGS_COACH_PATH)"));
  const settings = readFileSync(join(here, "..", "src/views/SettingsView.vue"), "utf8");
  check("设置页有外观锚点", settings.includes('data-coach="appearance"'));
  check("设置页只有一份软件更新", settings.includes("UpdateSettings") && !settings.includes("AboutSettings"));
  const updateSettings = readFileSync(join(here, "..", "src/views/settings/UpdateSettings.vue"), "utf8");
  check(
    "抢先体验绑 #20 偏好 API",
    updateSettings.includes("isPreviewEarlyAccessEnabled") &&
      updateSettings.includes("setPreviewEarlyAccessEnabled") &&
      !updateSettings.includes("previewChannelEnabled") &&
      updateSettings.includes("预览版可能不稳定")
  );
  check("没有第二套 previewChannel helper", !existsSync(join(here, "..", "src/services/previewChannelSettings.ts")));
  const eams = readFileSync(join(here, "..", "src/components/course/import/EamsSyncSection.vue"), "utf8");
  check("教务同步页底有爬虫致谢", eams.includes("eams-footer") && eams.includes("@LinJX1210") && eams.includes("连不上？"));
  const gridSettings = readFileSync(join(here, "..", "src/views/settings/GridSettings.vue"), "utf8");
  check("上课时间锚点打在时间细节整块上", (gridSettings.match(/data-coach="period-timing"/g) || []).length === 1 && gridSettings.includes('class="section" data-coach="period-timing"'));
  const coachBubble = readFileSync(join(here, "..", "src/components/coach/FeatureCoach.vue"), "utf8");
  const weekGridSource = readFileSync(join(here, "..", "src/components/timetable/WeekGrid.vue"), "utf8");
  check("长按调时间步骤有锚点：气泡找得到课表左侧时间列", coachBubble.includes('step.target === "period-time"') && coachBubble.includes("[data-coach-period-time]") && weekGridSource.includes("data-coach-period-time"));
  const topBar = readFileSync(join(here, "..", "src/components/layout/TopBar.vue"), "utf8");
  check("齿轮在垃圾桶左边", topBar.indexOf("data-edit-target") < topBar.indexOf("data-trash-target") && topBar.includes("Settings"));
  const sidebar = readFileSync(join(here, "..", "src/components/layout/SideBar.vue"), "utf8");
  const footer = sidebar.match(/const footerItems: MenuItem\[\] = \[([\s\S]*?)\];/);
  const footerLabels = footer
    ? [...footer[1].matchAll(/label: "([^"]+)"/g)].map((m) => m[1])
    : [];
  check("设置是侧栏菜单最后一项", footerLabels.length > 0 && footerLabels.at(-1) === "设置");

  coach.resetEmptyCellDeferral();
  check("格子还没画出来就继续等", coach.emptyCellAnchorState(0, 0) === "waiting");
  check("有格子但没空位就跳过这一步", coach.emptyCellAnchorState(70, 0) === "missing");
  check("有空格子才指向", coach.emptyCellAnchorState(70, 4) === "ready");
  check("格子还没画出来，删除步骤也等", coach.courseBlockAnchorState(0, 0) === "waiting");
  check("这一周没课块就推迟删除步骤", coach.courseBlockAnchorState(70, 0) === "missing");
  check("有课块才指向删除", coach.courseBlockAnchorState(70, 3) === "ready");

  const pack = [
    { id: 1, dayOfWeek: 1, startPeriod: 1, endPeriod: 2, startWeek: 1, endWeek: 16 },
    { id: 2, dayOfWeek: 2, startPeriod: 3, endPeriod: 4, startWeek: 1, endWeek: 16 }
  ];
  const print = coach.timetableFingerprint(3, pack);
  check("同一张课表指纹相同", print === coach.timetableFingerprint(3, [...pack].reverse()));
  check("改课或换表指纹就变", print !== coach.timetableFingerprint(3, pack.slice(0, 1)) && print !== coach.timetableFingerprint(4, pack));

  coach.rememberEmptyCellUnanchored(6, print);
  check("同一周同一份课表不再自动找空格子", coach.isEmptyCellDeferred(6, print) === true);
  check("翻到另一周可以再找", coach.isEmptyCellDeferred(7, print) === false);
  check("重新导入后可以再找", coach.isEmptyCellDeferred(6, coach.timetableFingerprint(3, pack.slice(0, 1))) === false);
  check("关导入或回主页不算课表变了", coach.isEmptyCellDeferred(6, coach.timetableFingerprint(3, pack)) === true);

  const deferred = coach.autoCoachQueue({
    seenIds: null,
    hasCoursesOnCurrentWeek: true,
    deferEmptyCell: true
  });
  check("推迟空格子后继续删除和后面的步骤", deferred.map((step) => step.id).join(",") === "delete-course-v1,adjust-period-time-v1,menu-reopen-guide-v1,import-from-menu-v1,appearance-settings-v1,period-timing-settings-v3");
  check("推迟空格子不加「新功能」", deferred.every((step) => step.prefixNew === false));
  check(
    "关导入或回主页不会只剩空格子那一步空转",
    coach.autoCoachQueue({
      seenIds: ["menu-reopen-guide-v1", "import-from-menu-v1", "delete-course-v1", "adjust-period-time-v1", "appearance-settings-v1", "period-timing-settings-v3"],
      hasCoursesOnCurrentWeek: true,
      deferEmptyCell: coach.isEmptyCellDeferred(6, print)
    }).length === 0
  );
  const bothDeferred = coach.autoCoachQueue({
    seenIds: ["menu-reopen-guide-v1", "import-from-menu-v1", "adjust-period-time-v1", "appearance-settings-v1", "period-timing-settings-v3"],
    hasCoursesOnCurrentWeek: true,
    deferEmptyCell: true,
    deferCourseBlock: true
  });
  check("空格子和课块都推迟就不再空转", bothDeferred.length === 0);
  check(
    "不推迟时双击加课仍在最前",
    coach.autoCoachQueue({ seenIds: null, hasCoursesOnCurrentWeek: true, deferEmptyCell: false })[0]?.id === "double-tap-empty-add-v1"
  );
  check(
    "翻周会重新跑自动引导（不只靠课表数据）",
    /watch\(\s*currentWeek\s*,/.test(home) && home.includes("startAutoCoach")
  );
  const bar = readFileSync(join(here, "..", "src/components/edit/EditModeBar.vue"), "utf8");
  check("编辑计数用主题正文色", bar.includes("color: var(--theme-body-text)") && !bar.includes("color: #000") && !bar.includes("is-on-dark"));
  const grid = readFileSync(join(here, "..", "src/components/timetable/WeekGrid.vue"), "utf8");
  check("今天不再铺列身浅色", !grid.includes(".cell.is-today") && grid.includes("day-header.is-today"));
  const deleteDialog = readFileSync(join(here, "..", "src/components/course/DeleteScopeDialog.vue"), "utf8");
  check("删除对话框默认仅当前周", deleteDialog.includes('weekScope = ref<DeleteWeekScope>("current")'));
  check("删除整学期会二次确认", deleteDialog.includes("DELETE_SEMESTER_CONFIRM") && deleteDialog.includes("danger: true"));
  check("删除范围文案", deleteDialog.includes("仅删除本周安排") && deleteDialog.includes("删除本学期该课全部安排") && deleteDialog.includes("选择要删除的周次"));
  check("Home 接了删除范围对话框", home.includes("DeleteScopeDialog") && home.includes("onRequestDelete"));
  const shineCss = readFileSync(join(here, "..", "src/styles/global.css"), "utf8");
  check(
    "扫光只打在课表表头和预设色条",
    shineCss.includes(".metal-sheen-surface::after") &&
      shineCss.includes(".week-grid > .header::after") &&
      shineCss.includes(".top-bar::after") &&
      shineCss.includes(".p-header.is-metal-strip::after") &&
      !shineCss.includes(".coach-") &&
      !shineCss.includes(".course-block") &&
      shineCss.includes("prefers-reduced-motion")
  );
  check(
    "扫光按卡片圆角裁切，不用铺满的矩形层",
    shineCss.includes("overflow: hidden") &&
      shineCss.includes("clip-path: inset(0") &&
      shineCss.includes("border-radius: inherit") &&
      shineCss.includes("mask-image") &&
      shineCss.includes("transform: translateX(-120%)") &&
      !shineCss.includes("inset: 0") &&
      !shineCss.includes("background-position")
  );
  coach.resetEmptyCellDeferral();
  coach.resetCourseBlockDeferral();

  const store = memory();
  check("没记录就是第一次", coach.readSeenStepIds(store) === null);
  coach.addSeenStepIds(store, ["menu-reopen-guide-v1"]);
  coach.addSeenStepIds(store, ["menu-reopen-guide-v1", "import-from-menu-v1"]);
  check("已看 id 只增不删", JSON.stringify(coach.readSeenStepIds(store)) === JSON.stringify(["menu-reopen-guide-v1", "import-from-menu-v1"]));
}

console.log("");
console.log("=== 气泡位置 ===");
{
  const phone = coach.placeBubble(
    { left: 170, top: 100, width: 40, height: 34 },
    { width: 390, height: 844 },
    { top: 47, right: 0, bottom: 34, left: 0 },
    { width: 260, height: 150 }
  );
  check("刘海下面", phone.top >= 47 + 8, phone);
  check("竖屏放在目标下方", phone.side === "below" && phone.top >= 134, phone);
  check("不超出屏幕", phone.left >= 8 && phone.left + phone.width <= 390 - 8, phone);

  const land = coach.placeBubble(
    { left: 80, top: 250, width: 48, height: 40 },
    { width: 700, height: 320 },
    { top: 0, right: 0, bottom: 0, left: 44 },
    { width: 260, height: 160 }
  );
  check("横屏目标在底部时改到上方", land.side === "above", land);
  check("避开左侧刘海", land.left >= 44 + 8, land);
  check("横屏仍在屏幕里", land.top >= 8 && land.top + land.height <= 312, land);

  const narrow = coach.placeBubble(
    { left: 0, top: 80, width: 36, height: 36 },
    { width: 280, height: 500 },
    { top: 0, right: 0, bottom: 0, left: 0 },
    { width: 260, height: 140 }
  );
  check("窄屏不把气泡挤出右边", narrow.left >= 8 && narrow.left + narrow.width <= 272, narrow);

  const view = { left: 40, top: 120, width: 300, height: 400 };
  const rects = [
    { left: 0, top: 0, width: 30, height: 30 },
    { left: 50, top: 140, width: 40, height: 40 },
    { left: 180, top: 280, width: 40, height: 40 }
  ];
  check("优先指向屏幕里的空格子", coach.chooseAnchorIndex(rects, view) === 2, coach.chooseAnchorIndex(rects, view));
  check("没有格子就不选", coach.chooseAnchorIndex([], view) === -1);
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
