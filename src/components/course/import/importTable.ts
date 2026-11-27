/// Naming and wording for imports that land in a new course table, shared by the three import tabs
/// so they name the table and describe the result the same way.

/// What an import reports back. `tableName` and `tableId` are only there when it went into a new
/// course table; `skipped` is how many schedules the file had that could not be placed.
export interface ImportOutcome {
  success: boolean;
  message: string;
  count: number;
  skipped?: number;
  tableName?: string;
  tableId?: number;
}

const pad = (value: number) => String(value).padStart(2, "0");

/// Today as "MM-DD", the same shape the timetable header uses for dates.
export const importDateLabel = (): string => {
  const today = new Date();
  return `${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
};

/// A table name for an imported file: the file's own name without ".json", which is the one thing
/// the user chose themselves. Falls back to a dated name when nothing usable is left.
export const tableNameFromFile = (fileName: string): string => {
  const stem = fileName.replace(/\.json$/i, "").trim();
  return stem || `导入 ${importDateLabel()}`;
};

/// The one line that reports an import into a new table. The sheet closes right after it, so it is
/// all the user sees of the result; the old table stays reachable from 选择课程表.
export const newTableToast = (tableName: string): string => `已导入为新课表「${tableName}」`;

/// A line for schedules the import could not place, or "" when nothing was lost. Counts as a warning:
/// the sheet stays open until the user has had the chance to read it.
export const skippedNotice = (skipped?: number): string =>
  skipped ? `${skipped} 条课段未找到对应课程，已跳过。` : "";

/// A line for classes that sit below the last row of the grid, or "" when the grid is tall enough.
/// Counts as a warning: those classes are imported but not drawn until the grid grows.
export const periodOverflowNotice = (maxPeriod: number, gridPeriods: number): string =>
  maxPeriod > gridPeriods
    ? `部分课程排至第 ${maxPeriod} 节，请在「设置 → 网格设置」中将节数调整为不少于 ${maxPeriod} 节。`
    : "";
