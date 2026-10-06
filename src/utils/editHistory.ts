// 课表上的原地编辑（拖动、删除、双击加课）共用一条回退记录。
// 按课程表分开存。每次用户动作记一整份课表快照，所以「拖动学期课」里
// 取消原位置再放下新位置是同一步，回退会一起撤掉。新的编辑会清掉前进。
//
// 界面上的数字不用自己加减：num = 当前下标 − 这次进入编辑时的下标。
// 正数在底栏正中显示黑色「+N」，0 整行不显示，负数显示黑色「-N」。没有底色，也没有边框。
// 回退可以越过这次进入时的课表，一直回到还留着的最早一步。没有开关。
//
// 每张课表最多 500 个动作组，多出来的静默丢掉最早的，进入编辑时的下标一起挪。
// 手机上整段写在 SQLite；浏览器没有 SQLite 时写在 localStorage，上限一样。
// 导入、重新导入和清空只留下操作完成的那一份，接不回中间状态，也接不回操作之前。
// importAsNewCourseTable 新建的课表一开始没有记录，导入成功后才写下完成时的那一份。

import type { Course, CourseSchedule } from "@/types/course";

export const EDIT_HISTORY_LIMIT = 500;
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

/// num = currentHistoryIndex − sessionEntryIndex. Do not keep a second counter.
export const sessionChangeCount = (currentHistoryIndex: number, sessionEntryIndex: number): number =>
  currentHistoryIndex - sessionEntryIndex;

/// Append one user action. Drops the redo tail. Keeps at most `limit` snapshots.
/// When the oldest groups are dropped, sessionEntryIndex moves with them so the
/// difference above still counts from the same snapshot.
export const pushSnapshot = (
  history: TableHistory,
  next: TimetableSnapshot,
  sessionEntryIndex: number,
  limit = EDIT_HISTORY_LIMIT
): { history: TableHistory; sessionEntryIndex: number; changed: boolean } => {
  const tip = history.snapshots[history.index];
  if (tip && sameSnapshot(tip, next)) {
    return { history, sessionEntryIndex, changed: false };
  }

  const kept = history.snapshots.slice(0, history.index + 1);
  kept.push(next);
  let index = kept.length - 1;
  let entry = sessionEntryIndex;
  if (kept.length > limit) {
    const drop = kept.length - limit;
    kept.splice(0, drop);
    index -= drop;
    entry -= drop;
  }
  return { history: { snapshots: kept, index }, sessionEntryIndex: entry, changed: true };
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

export const capHistory = (history: TableHistory, limit = EDIT_HISTORY_LIMIT): TableHistory => {
  if (history.snapshots.length <= limit) return history;
  const drop = history.snapshots.length - limit;
  const index = history.index - drop;
  return {
    snapshots: history.snapshots.slice(drop),
    index: index < 0 ? 0 : index
  };
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

export const normalizeHistory = (value: unknown): TableHistory | null =>
  isHistory(value) ? value : null;

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
  const capped = capHistory(history);
  if (capped.snapshots.length === 0) {
    delete store[String(tableId)];
  } else {
    store[String(tableId)] = capped;
  }
  storage.setItem(EDIT_HISTORY_STORAGE_KEY, JSON.stringify(store));
};

export const forgetTableHistory = (storage: StorageLike, tableId: number): void => {
  const store = readStore(storage);
  delete store[String(tableId)];
  storage.setItem(EDIT_HISTORY_STORAGE_KEY, JSON.stringify(store));
};
