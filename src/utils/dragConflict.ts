// 拖动过程中的冲突预览。
//
// 课表上的红框、半透明和错开，本来只看已经保存的课段。拖动时卡片只是平移，位置要松手才写回去，
// 所以叠到别的课上时那套样式一直不出现。这里按「松手后会落在哪」重算一遍：被拖的课离开原位，
// 占住落点那一段；还没对准格子（或落点放不下）时它先离开课表，不跟任何课冲突。

export interface SpanBlock {
  id: number;
  day: number;
  start: number;
  end: number;
}

export interface DragSlot {
  id: number;
  /// null：这节课被拿起来了，还没有能放下的格子。
  at: { day: number; start: number; end: number } | null;
}

export interface ConflictPlacement {
  count: number;
  index: number;
}

const overlaps = (first: SpanBlock, second: SpanBlock) =>
  first.day === second.day &&
  first.start <= second.end &&
  second.start <= first.end;

/// 只收录真的叠在一起的课。不在表里的课就是单独一节（count 1）。
/// 分组方式和课表静止时一致：先按出现顺序连通，组内再按开始节、id 排序，错开下标用这个顺序。
export const conflictPlacements = (
  blocks: SpanBlock[],
  drag: DragSlot | null
): Map<number, ConflictPlacement> => {
  const placed: SpanBlock[] = [];
  for (const block of blocks) {
    if (drag && block.id === drag.id) {
      if (!drag.at) continue;
      placed.push({
        id: block.id,
        day: drag.at.day,
        start: drag.at.start,
        end: drag.at.end
      });
      continue;
    }
    placed.push(block);
  }

  const result = new Map<number, ConflictPlacement>();
  const visited = new Set<number>();

  for (const block of placed) {
    if (visited.has(block.id)) continue;

    const queue = [block];
    const group: SpanBlock[] = [];
    visited.add(block.id);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      group.push(current);

      for (const candidate of placed) {
        if (visited.has(candidate.id)) continue;
        if (!overlaps(current, candidate)) continue;
        visited.add(candidate.id);
        queue.push(candidate);
      }
    }

    if (group.length <= 1) continue;

    const sorted = [...group].sort((a, b) => a.start - b.start || a.id - b.id);
    sorted.forEach((item, index) => {
      result.set(item.id, { count: sorted.length, index });
    });
  }

  return result;
};
