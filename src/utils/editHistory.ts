// 课表上的原地编辑（拖动、删除、双击加课）共用一条回退记录。
// 按课程表 id 分开存。每次用户动作记一整份课表快照，所以「拖动学期课」里
// 取消原位置再放下新位置是同一步，回退会一起撤掉。
//
// 「历史记录」默认关。关着时，回退只到这次进入编辑时的课表；更早的快照仍留着，
// 打开之后才能一路回到最早的一步。导入和清空会把这张课表的记录换成操作之后的样子，
// 更早的拖动就接不上了。

import type { Course, CourseSchedule } from "@/types/course";

export const EDIT_HISTORY_LIMIT = 200;
export const EDIT_HISTORY_STORAGE_KEY = "course-mngr-edit-history";
export const EDIT_HISTORY_DEEP_KEY = "course-mngr-edit-history-deep";

export interface TimetableSnapshot {
  courses: Course[];
  schedules: CourseSchedule[];
}

export interface TableHistory {
  snapshots: TimetableSnapshot[];
  index: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const cloneSnapshot = (courses: Course[], schedules: CourseSchedule[]): TimetableSnapshot => ({
  courses: courses.map(course => ({ ...course })),
  schedules: schedules.map(schedule => ({ ...schedule }))
});

const sameSnapshot = (left: TimetableSnapshot, right: TimetableSnapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const seedHistory = (snapshot: TimetableSnapshot): TableHistory => ({
  snapshots: [snapshot],
  index: 0
});

/// Append one user action. Drops the redo tail. Keeps at most `limit` snapshots;
/// dropping from the front moves `floor` with them so a session start stays pointed
/// at the same snapshot.
export const pushSnapshot = (
  history: TableHistory,
  next: TimetableSnapshot,
  floor: number,
  limit = EDIT_HISTORY_LIMIT
): { history: TableHistory; floor: number; changed: boolean } => {
  const tip = history.snapshots[history.index];
  if (tip && sameSnapshot(tip, next)) {
    return { history, floor, changed: false };
  }

  const kept = history.snapshots.slice(0, history.index + 1);
  kept.push(next);
  let nextFloor = floor;
  let index = kept.length - 1;
  if (kept.length > limit) {
    const drop = kept.length - limit;
    kept.splice(0, drop);
    index -= drop;
    nextFloor = Math.max(0, nextFloor - drop);
  }
  return { history: { snapshots: kept, index }, floor: nextFloor, changed: true };
};

/// `deep` false: cannot step before `floor` (the snapshot on screen when this edit session started).
/// `deep` true: can step back to the oldest snapshot still stored.
export const canUndo = (history: TableHistory, floor: number, deep: boolean): boolean => {
  const min = deep ? 0 : Math.min(Math.max(0, floor), history.index);
  return history.index > min;
};

export const canRedo = (history: TableHistory): boolean =>
  history.index < history.snapshots.length - 1;

export const undoStep = (history: TableHistory, floor: number, deep: boolean): TableHistory | null => {
  if (!canUndo(history, floor, deep)) return null;
  return { ...history, index: history.index - 1 };
};

export const redoStep = (history: TableHistory): TableHistory | null => {
  if (!canRedo(history)) return null;
  return { ...history, index: history.index + 1 };
};

const isSnapshot = (value: unknown): value is TimetableSnapshot => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as TimetableSnapshot;
  return Array.isArray(snapshot.courses) && Array.isArray(snapshot.schedules);
};

const isHistory = (value: unknown): value is TableHistory => {
  if (!value || typeof value !== "object") return false;
  const history = value as TableHistory;
  return Array.isArray(history.snapshots) &&
    history.snapshots.every(isSnapshot) &&
    history.snapshots.length > 0 &&
    Number.isInteger(history.index) &&
    history.index >= 0 &&
    history.index < history.snapshots.length;
};

const readStore = (storage: StorageLike): Record<string, TableHistory> => {
  const raw = storage.getItem(EDIT_HISTORY_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const store: Record<string, TableHistory> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isHistory(value)) store[key] = value;
    }
    return store;
  } catch {
    return {};
  }
};

export const readTableHistory = (storage: StorageLike, tableId: number): TableHistory | null =>
  readStore(storage)[String(tableId)] ?? null;

export const writeTableHistory = (storage: StorageLike, tableId: number, history: TableHistory): void => {
  const store = readStore(storage);
  store[String(tableId)] = history;
  storage.setItem(EDIT_HISTORY_STORAGE_KEY, JSON.stringify(store));
};

export const forgetTableHistory = (storage: StorageLike, tableId: number): void => {
  const store = readStore(storage);
  delete store[String(tableId)];
  storage.setItem(EDIT_HISTORY_STORAGE_KEY, JSON.stringify(store));
};

/// Absent or unreadable means off: a fresh install only undoes the edit session on screen.
export const readDeepHistory = (storage: StorageLike): boolean =>
  storage.getItem(EDIT_HISTORY_DEEP_KEY) === "1";

export const writeDeepHistory = (storage: StorageLike, enabled: boolean): void => {
  storage.setItem(EDIT_HISTORY_DEEP_KEY, enabled ? "1" : "0");
};
