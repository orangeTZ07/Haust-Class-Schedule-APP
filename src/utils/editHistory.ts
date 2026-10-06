// 课表上的原地编辑（拖动、删除、双击加课）共用一条回退记录。
// 按课程表 id 分开存。每次用户动作记一整份课表快照，所以「拖动学期课」里
// 取消原位置再放下新位置是同一步，回退会一起撤掉。
//
// 回退默认可以越过这次进入编辑时的课表，一直回到还留着的最早一步。
// 界面上的「新增改动」从这次进入时的 0 起算，再往前撤就是负数。
// 导入和清空会把这张课表的记录换成操作之后的样子，更早的拖动就接不上了。

import type { Course, CourseSchedule } from "@/types/course";

export const EDIT_HISTORY_LIMIT = 200;
export const EDIT_HISTORY_STORAGE_KEY = "course-mngr-edit-history";

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

/// Append one user action. Drops the redo tail. Keeps at most `limit` snapshots.
export const pushSnapshot = (
  history: TableHistory,
  next: TimetableSnapshot,
  limit = EDIT_HISTORY_LIMIT
): { history: TableHistory; changed: boolean } => {
  const tip = history.snapshots[history.index];
  if (tip && sameSnapshot(tip, next)) {
    return { history, changed: false };
  }

  const kept = history.snapshots.slice(0, history.index + 1);
  kept.push(next);
  let index = kept.length - 1;
  if (kept.length > limit) {
    const drop = kept.length - limit;
    kept.splice(0, drop);
    index -= drop;
  }
  return { history: { snapshots: kept, index }, changed: true };
};

/// Undo is not limited to the current edit session.
export const canUndo = (history: TableHistory): boolean =>
  history.snapshots.length > 0 && history.index > 0;

export const canRedo = (history: TableHistory): boolean =>
  history.index < history.snapshots.length - 1;

export const undoStep = (history: TableHistory): TableHistory | null => {
  if (!canUndo(history)) return null;
  return { ...history, index: history.index - 1 };
};

export const redoStep = (history: TableHistory): TableHistory | null => {
  if (!canRedo(history)) return null;
  return { ...history, index: history.index + 1 };
};

/// 0 is the timetable on screen when this edit session started.
/// A forward edit or a redo adds one. Undo subtracts one, and the result may be negative.
export const stepSessionCount = (count: number, kind: "edit" | "undo" | "redo"): number =>
  kind === "undo" ? count - 1 : count + 1;

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
