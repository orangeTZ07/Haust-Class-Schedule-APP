// 编辑回退：一步一个快照，回退可以越过本次编辑的起点。

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const history = await loadTs(join(here, "..", "src/utils/editHistory.ts"));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const snap = (name) => ({
  courses: [{ id: 1, name, color: "#fff" }],
  schedules: []
});

console.log("=== 回退记录 ===");
{
  let state = history.seedHistory(snap("起点"));
  const first = history.pushSnapshot(state, snap("拖动"));
  state = first.history;
  check("拖动记成新的一步", state.index === 1 && state.snapshots.length === 2, state.index);
  check("起点还在", state.snapshots[0].courses[0].name === "起点");

  const undone = history.undoStep(state);
  check("可以撤掉这一步", undone?.index === 0, undone?.index);
  check("撤到最早就不能再撤", history.undoStep(undone) === null);

  const redone = history.redoStep(undone);
  check("前进回到拖动后", redone?.index === 1);

  const again = history.pushSnapshot(undone, snap("另一次"));
  check(
    "回退之后再编辑会清掉前进",
    again.history.snapshots.length === 2 && again.history.snapshots[1].courses[0].name === "另一次",
    again.history.snapshots.map(item => item.courses[0].name)
  );
  check("没有变化不再记一步", history.pushSnapshot(again.history, snap("另一次")).changed === false);
}

{
  let state = history.seedHistory(snap("更早"));
  state = history.pushSnapshot(state, snap("上次")).history;
  state = history.pushSnapshot(state, snap("这次")).history;
  const once = history.undoStep(state);
  check("先回到这次编辑之前", once?.index === 1, once?.index);
  const older = history.undoStep(once);
  check("不需要开关也能回到最早", older?.index === 0 && older.snapshots[0].courses[0].name === "更早");
  check("最早之后还能前进", history.canRedo(older) === true);
}

{
  let count = 0;
  count = history.stepSessionCount(count, "edit");
  count = history.stepSessionCount(count, "edit");
  check("两次编辑是 2", count === 2);
  count = history.stepSessionCount(count, "undo");
  count = history.stepSessionCount(count, "undo");
  count = history.stepSessionCount(count, "undo");
  check("退过起点变成负数", count === -1);
  count = history.stepSessionCount(count, "redo");
  check("前进把负数收回来", count === 0);
  count = history.stepSessionCount(count, "edit");
  check("从退过的位置再编辑会加一", count === 1);
}

{
  let state = history.seedHistory(snap("0"));
  for (let i = 1; i <= 4; i++) {
    state = history.pushSnapshot(state, snap(String(i)), 3).history;
  }
  check(
    "超过上限只留最近几步",
    state.snapshots.length === 3 && state.snapshots.map(item => item.courses[0].name).join(",") === "2,3,4",
    state.snapshots.map(item => item.courses[0].name)
  );
}

{
  const storage = {
    items: new Map(),
    getItem(key) { return this.items.has(key) ? this.items.get(key) : null; },
    setItem(key, value) { this.items.set(key, value); }
  };
  const seeded = history.seedHistory(snap("甲"));
  history.writeTableHistory(storage, 7, seeded);
  check("按课表 id 读取", history.readTableHistory(storage, 7)?.snapshots[0].courses[0].name === "甲");
  check("另一张课表没有记录", history.readTableHistory(storage, 8) === null);
  history.forgetTableHistory(storage, 7);
  check("删掉课表就忘掉记录", history.readTableHistory(storage, 7) === null);
  storage.setItem(history.EDIT_HISTORY_STORAGE_KEY, "{");
  check("坏掉的记录不当成有历史", history.readTableHistory(storage, 7) === null);
}

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n  ALL CHECKS PASSED");
