// 编辑回退：一步一个快照。数字是当前下标减进入编辑时的下标，回退可以越过本次起点。

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
  const first = history.pushSnapshot(state, snap("拖动"), 0);
  state = first.history;
  check("拖动记成新的一步", state.index === 1 && state.snapshots.length === 2, state.index);
  check("起点还在", state.snapshots[0].courses[0].name === "起点");

  const undone = history.undoStep(state);
  check("可以撤掉这一步", undone?.index === 0, undone?.index);
  check("撤到最早就不能再撤", history.undoStep(undone) === null);

  const redone = history.redoStep(undone);
  check("前进回到拖动后", redone?.index === 1);

  const again = history.pushSnapshot(undone, snap("另一次"), 0);
  check(
    "回退之后再编辑会清掉前进",
    again.history.snapshots.length === 2 && again.history.snapshots[1].courses[0].name === "另一次",
    again.history.snapshots.map(item => item.courses[0].name)
  );
  check("没有变化不再记一步", history.pushSnapshot(again.history, snap("另一次"), 0).changed === false);
}

{
  let state = history.seedHistory(snap("更早"));
  state = history.pushSnapshot(state, snap("上次"), 0).history;
  state = history.pushSnapshot(state, snap("这次"), 0).history;
  const once = history.undoStep(state);
  check("先回到这次编辑之前", once?.index === 1, once?.index);
  const older = history.undoStep(once);
  check("不需要开关也能回到最早", older?.index === 0 && older.snapshots[0].courses[0].name === "更早");
  check("最早之后还能前进", history.canRedo(older) === true);
}

{
  let state = history.seedHistory(snap("更早"));
  let entry = 0;
  state = history.pushSnapshot(state, snap("上次"), entry).history;
  const beforeSession = history.pushSnapshot(state, snap("这次"), entry);
  state = beforeSession.history;
  entry = state.index;
  const edited = history.pushSnapshot(state, snap("本次"), entry);
  state = edited.history;
  entry = edited.sessionEntryIndex;
  check("本次一处来自下标相减", history.sessionChangeCount(state.index, entry) === 1, {
    index: state.index,
    entry
  });
  state = history.undoStep(state);
  check("退回本次起点是 0", history.sessionChangeCount(state.index, entry) === 0);
  state = history.undoStep(state);
  check("退过起点是 -1", history.sessionChangeCount(state.index, entry) === -1);
  state = history.undoStep(state);
  check("再退一处是 -2", history.sessionChangeCount(state.index, entry) === -2 && state.snapshots[0].courses[0].name === "更早");
  const redone = history.redoStep(state);
  check("前进不改进入时的下标", history.sessionChangeCount(redone.index, entry) === -1);

  const back = history.undoStep(redone);
  const replaced = history.pushSnapshot(back, snap("新的一处"), entry);
  check(
    "退过起点再编辑仍用下标相减",
    history.sessionChangeCount(replaced.history.index, replaced.sessionEntryIndex) === -1 &&
      replaced.history.snapshots.length === 2 &&
      replaced.history.snapshots[1].courses[0].name === "新的一处"
  );
}

{
  let state = history.seedHistory(snap("0"));
  let entry = 0;
  for (let i = 1; i <= 4; i++) {
    const pushed = history.pushSnapshot(state, snap(String(i)), entry, 3);
    state = pushed.history;
    entry = pushed.sessionEntryIndex;
  }
  check(
    "超过上限只留最近几步",
    state.snapshots.length === 3 && state.snapshots.map(item => item.courses[0].name).join(",") === "2,3,4",
    state.snapshots.map(item => item.courses[0].name)
  );
  check("丢掉最早几步时进入下标一起挪", entry === -2 && history.sessionChangeCount(state.index, entry) === 4, entry);
  check("默认上限是 500", history.EDIT_HISTORY_LIMIT === 500);
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
