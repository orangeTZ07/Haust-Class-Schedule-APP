// 拖动还没松手时，冲突样式要按落点算，而不是按卡片原来的格子。

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const conflict = await loadTs(join(here, "..", "src/utils/dragConflict.ts"));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const blocks = [
  { id: 1, day: 1, start: 1, end: 2 },
  { id: 2, day: 1, start: 3, end: 4 },
  { id: 3, day: 3, start: 1, end: 2 },
  { id: 4, day: 5, start: 5, end: 6 }
];

const meta = (map, id) => map.get(id) ?? { count: 1, index: 0 };

console.log("=== 没在拖：各上各的 ===");
{
  const map = conflict.conflictPlacements(blocks, null);
  check("周一两节不重叠", meta(map, 1).count === 1 && meta(map, 2).count === 1);
  check("别的日子也不重叠", meta(map, 3).count === 1 && meta(map, 4).count === 1);
}

console.log("=== 拖到别人身上：双方立刻算冲突 ===");
{
  const map = conflict.conflictPlacements(blocks, {
    id: 1,
    at: { day: 1, start: 3, end: 4 }
  });
  check("被拖的课 count 2", meta(map, 1).count === 2);
  check("被盖住的课 count 2", meta(map, 2).count === 2);
  check("没被盖住的课不变", meta(map, 3).count === 1 && meta(map, 4).count === 1);
  check("开始节相同则 id 小的排在前面", meta(map, 1).index === 0 && meta(map, 2).index === 1, {
    dragged: meta(map, 1),
    covered: meta(map, 2)
  });
}

console.log("=== 只擦到下一节，也算重叠 ===");
{
  const map = conflict.conflictPlacements(blocks, {
    id: 1,
    at: { day: 1, start: 2, end: 3 }
  });
  check("1-2 拖成 2-3，盖住 3-4", meta(map, 1).count === 2 && meta(map, 2).count === 2);
  check("开始更早的排在前面", meta(map, 1).index === 0 && meta(map, 2).index === 1);
}

console.log("=== 拖走之后，原来叠在一起的分开 ===");
{
  const paired = [
    { id: 1, day: 1, start: 1, end: 2 },
    { id: 2, day: 1, start: 1, end: 2 },
    { id: 3, day: 4, start: 5, end: 6 }
  ];
  const before = conflict.conflictPlacements(paired, null);
  check("松手之前这两节是冲突", meta(before, 1).count === 2 && meta(before, 2).count === 2);
  const away = conflict.conflictPlacements(paired, {
    id: 1,
    at: { day: 4, start: 1, end: 2 }
  });
  check("拖走后留下的那节恢复单独", meta(away, 2).count === 1);
  check("落到空格子也不冲突", meta(away, 1).count === 1 && meta(away, 3).count === 1);
}

console.log("=== 拿在半空、或连成三节 ===");
{
  const lifted = conflict.conflictPlacements(blocks, { id: 1, at: null });
  check("没对准格子时不跟任何人冲突", meta(lifted, 1).count === 1 && meta(lifted, 2).count === 1);

  const chain = conflict.conflictPlacements(
    [
      { id: 10, day: 2, start: 1, end: 2 },
      { id: 11, day: 2, start: 2, end: 3 },
      { id: 12, day: 2, start: 3, end: 4 }
    ],
    null
  );
  check("挨着叠的三节是同一组", meta(chain, 10).count === 3 && meta(chain, 12).count === 3);
  check("按开始节排下标", meta(chain, 10).index === 0 && meta(chain, 11).index === 1 && meta(chain, 12).index === 2);

  const otherDay = conflict.conflictPlacements(blocks, {
    id: 1,
    at: { day: 3, start: 5, end: 6 }
  });
  check("换到另一天的空档不冲突", meta(otherDay, 1).count === 1 && meta(otherDay, 3).count === 1);
}

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n  ALL CHECKS PASSED");
