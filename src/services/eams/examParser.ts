export interface ExamEntry {
  courseName: string;
  courseCode: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  seat: string;
}

export interface ExamSnapshot {
  syncedAt: string;
  exams: ExamEntry[];
}

const text = (node: Element | undefined) =>
  (node?.textContent ?? "").replace(/\s+/g, " ").trim();

export const isExamLandingPage = (html: string): boolean => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return !!doc.querySelector("form#semesterForm[action$='/stdExamTable.action']");
};

/// Format checks only: they catch a changed table layout. The values themselves come from EAMS.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const parseTimeRange = (value: string): [string, string] | null => {
  const range = value.match(/^(\d{1,2}:\d{2})\s*[~～〜–—至-]\s*(\d{1,2}:\d{2})$/);
  return range ? [range[1].padStart(5, "0"), range[2].padStart(5, "0")] : null;
};

/// The same response contains a second table without exam dates. Match the scheduled table
/// by its headings, and reject a partial parse so a sync cannot drop previously saved exams.
export const parseExamTable = (html: string): ExamEntry[] | null => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const header of Array.from(doc.querySelectorAll<HTMLTableRowElement>("table tr"))) {
    const columns = Array.from(header.cells, text);
    if (!["课程名称", "考试日期", "考试安排", "考试地点"].every(label => columns.includes(label))) continue;

    const table = header.closest("table")!;
    const exams: ExamEntry[] = [];
    for (const row of Array.from(table.rows).slice(header.rowIndex + 1)) {
      if (row.parentElement?.tagName === "TFOOT") continue;
      const cells = row.cells;
      if (cells.length === 1 && /^(?:(?:暂无|没有|无)(?:数据|记录|考试安排)[。！!]?)?$/.test(text(cells[0]))) continue;
      if (cells.length !== columns.length) return null;

      const cell = (label: string) => text(cells[columns.indexOf(label)]);
      const courseName = cell("课程名称");
      const date = cell("考试日期");
      const times = parseTimeRange(cell("考试安排"));
      if (!courseName || !DATE.test(date) || !times) return null;

      exams.push({
        courseName,
        courseCode: cell("课程序号"),
        date,
        startTime: times[0],
        endTime: times[1],
        location: cell("考试地点"),
        seat: cell("考场座位号")
      });
    }

    return exams.sort((a, b) =>
      a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.courseName.localeCompare(b.courseName)
    );
  }
  return null;
};
