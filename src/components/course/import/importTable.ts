/// Naming and wording for imports that land in a new course table, shared by the three import tabs
/// so they name the table and describe the result the same way.

/// What an import reports back. `tableName` is only there when it went into a new course table;
/// `skipped` is how many schedules the file had that could not be placed.
export interface ImportOutcome {
  success: boolean;
  message: string;
  count: number;
  skipped?: number;
  tableName?: string;
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

/// The sentence appended to a success message when the import created a new table. It says where the
/// old timetable went, which is the first thing anyone wonders when the screen changes under them.
export const newTableNotice = (tableName: string): string =>
  `已导入为新课表「${tableName}」，原来的课表还在「选择课程表」里。`;

/// The toast for an import that went into a new table. Shorter than newTableNotice because the sheet
/// closes right after it, and the toast is all the user sees of the result.
export const newTableToast = (tableName: string): string => `已导入为新课表「${tableName}」`;

/// A line for schedules the import could not place, or "" when nothing was lost. Counts as a warning:
/// the sheet stays open until the user has had the chance to read it.
export const skippedNotice = (skipped?: number): string =>
  skipped ? `有 ${skipped} 条课段找不到对应的课程，已跳过。` : "";
