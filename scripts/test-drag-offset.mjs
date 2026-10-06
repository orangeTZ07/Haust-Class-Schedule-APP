// 拖动偏移只作用在被抓的那一条。别的课必须保持原地。

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const drag = await loadTs(join(here, "..", "src/utils/dragOffset.ts"));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

console.log("=== 拖动只动目标课 ===");
{
  const state = { scheduleId: 7, offsetX: 40, offsetY: -12, hasMoved: true };
  check("被抓的课带着偏移", drag.offsetForSchedule(state, 7).x === 40 && drag.offsetForSchedule(state, 7).y === -12);
  check("旁边的课偏移是 0", drag.offsetForSchedule(state, 8) === drag.DRAG_ZERO);
  check("旁边的课不算正在拖", drag.isDraggingSchedule(state, 8) === false);
  check("没挪过足够距离不算拖", drag.isDraggingSchedule({ ...state, hasMoved: false }, 7) === false);
  check("没有拖动时大家都是零", drag.offsetForSchedule(null, 7) === drag.DRAG_ZERO);

  const other = drag.offsetForSchedule(state, 3);
  const again = drag.offsetForSchedule(state, 9);
  check("所有旁观课共用同一个零对象", other === again && other === drag.DRAG_ZERO);
}

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n  ALL CHECKS PASSED");
