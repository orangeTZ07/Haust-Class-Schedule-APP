// 编辑回退：一步一个快照，关着「历史记录」时不能越过本次编辑的起点。

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
  let floor = 0;
  const first = history.pushSnapshot(state, snap("拖动"), floor);
  state = first.history;
  floor = first.floor;
  check("拖动记成新的一步", state.index === 1 && state.snapshots.length === 2, state.index);
  check("起点还在", state.snapshots[0].courses[0].name === "起点");

  const undone = history.undoStep(state, floor, false);
  check("关着历史记录也能撤掉这一步", undone?.index === 0, undone?.index);
  check("撤到底就不能再撤", history.undoStep(undone, floor, false) === null);

  const redone = history.redoStep(undone);
  check("前进回到拖动后", redone?.index === 1);

  const again = history.pushSnapshot(undone, snap("另一次"), floor);
  check("回退之后再编辑会清掉前进", again.history.snapshots.length === 2 && again.history.snapshots[1].courses[0].name === "另一次", again.history.snapshots.map(item => item.courses[0].name));
  check("没有变化不再记一步", history.pushSnapshot(again.history, snap("另一次"), again.floor).changed === false);
}

{
  let state = history.seedHistory(snap("更早"));
  let floor = 0;
  state = history.pushSnapshot(state, snap("上次"), floor).history;
  floor = state.index;
  const session = history.pushSnapshot(state, snap("这次"), floor);
  state = session.history;
  floor = session.floor;
  check("本次起点停在进入编辑时", floor === 1, floor);
  const once = history.undoStep(state, floor, false);
  check("关掉时只能回到本次起点", once?.index === 1 && history.canUndo(once, floor, false) === false, once?.index);
  check("打开历史记录可以回到更早", history.canUndo(once, floor, true) === true);
  const older = history.undoStep(once, floor, true);
  check("打开后撤到最早", older?.index === 0 && older.snapshots[0].courses[0].name === "更早");
}

{
  let state = history.seedHistory(snap("0"));
  let floor = 0;
  for (let i = 1; i <= 2; i++) {
    const pushed = history.pushSnapshot(state, snap(String(i)), floor, 3);
    state = pushed.history;
    floor = pushed.floor;
  }
  floor = state.index;
  const pushed = history.pushSnapshot(state, snap("3"), floor, 3);
  state = pushed.history;
  floor = pushed.floor;
  check("超过上限只留最近几步", state.snapshots.length === 3, state.snapshots.map(item => item.courses[0].name));
  check("截掉开头后起点仍指着同一次编辑", state.snapshots[floor].courses[0].name === "2", { floor, names: state.snapshots.map(item => item.courses[0].name) });
}

{
  const storage = {
    items: new Map(),
    getItem(key) { return this.items.has(key) ? this.items.get(key) : null; },
    setItem(key, value) { this.items.set(key, value); }
  };
  check("没存过就是关着", history.readDeepHistory(storage) === false);
  history.writeDeepHistory(storage, true);
  check("打开会记住", history.readDeepHistory(storage) === true);
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
