/// Naming and wording for imports that land in a new course table, shared by the three import tabs
/// so they name the table and describe the result the same way.

/// What an import reports back. `tableName` is only there when it went into a new course table.
export interface ImportOutcome {
  success: boolean;
  message: string;
  count: number;
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
