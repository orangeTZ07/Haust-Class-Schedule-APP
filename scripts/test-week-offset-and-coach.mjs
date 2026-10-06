// 周次错位提示与操作引导的纯逻辑。不打开界面。
//
// 用法: node scripts/test-week-offset-and-coach.mjs

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
  check("第一次仍介绍菜单和导入", fresh.map((step) => step.id).join(",") === "menu-reopen-guide-v1,import-from-menu-v1", fresh.map((step) => step.id));

  const withCourses = coach.autoCoachQueue({ seenIds: null, hasCoursesOnCurrentWeek: true });
  check("有课才把双击加课放进来", withCourses[0]?.id === "double-tap-empty-add-v1" && withCourses[0].prefixNew === false);

  const later = coach.autoCoachQueue({
    seenIds: ["menu-reopen-guide-v1", "import-from-menu-v1"],
    hasCoursesOnCurrentWeek: true
  });
  check("只补没看过的步骤", later.map((step) => step.id).join(",") === "double-tap-empty-add-v1");
  check("补看的步骤带「新功能」", later[0]?.prefixNew === true);

  const done = coach.autoCoachQueue({
    seenIds: coach.COACH_STEPS.map((step) => step.id),
    hasCoursesOnCurrentWeek: true
  });
  check("都看过就不再自动出现", done.length === 0);

  const manual = coach.manualCoachQueue();
  check("菜单重开是全部步骤且不加前缀", manual.length === coach.COACH_STEPS.length && manual.every((step) => step.prefixNew === false));
  check("导入不在主屏", manual.find((step) => step.id === "import-from-menu-v1")?.offHome === true);

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
