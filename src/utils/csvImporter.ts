import type { CourseSchedule } from "@/types/course";

const dayMap: Record<string, number> = {
  "周一": 1, "星期一": 1,
  "周二": 2, "星期二": 2,
  "周三": 3, "星期三": 3,
  "周四": 4, "星期四": 4,
  "周五": 5, "星期五": 5,
  "周六": 6, "星期六": 6,
  "周日": 7, "星期日": 7, "周天": 7, "星期天": 7,
};

export interface ParsedCourse {
  name: string;
  day: number;
  startPeriod: number;
  endPeriod: number;
  location: string;
  startWeek?: number;
  endWeek?: number;
  weekType?: CourseSchedule["weekType"];
}

const stripCodeFence = (text: string) => {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:csv)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
};

const parseRows = (csvText: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuote = false;
  const text = stripCodeFence(csvText);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuote && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (char === "," && !inQuote) {
      row.push(cur.trim());
      cur = "";
    } else if ((char === "\n" || char === "\r") && !inQuote) {
      if (char === "\r" && next === "\n") i++;
      row.push(cur.trim());
      if (row.some(field => field.length > 0)) {
        rows.push(row);
      }
      row = [];
      cur = "";
    } else {
      cur += char;
    }
  }

  row.push(cur.trim());
  if (row.some(field => field.length > 0)) {
    rows.push(row);
  }

  return rows;
};

const parseWeekType = (value?: string): CourseSchedule["weekType"] => {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized.includes("单") || normalized === "odd") return "odd";
  if (normalized.includes("双") || normalized === "even") return "even";
  return "all";
};

const parseWeek = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt((value || "").match(/\d+/)?.[0] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function parseCSV(csvText: string): ParsedCourse[] {
  const rows = parseRows(csvText);
  if (rows.length === 0) return [];

  // 启发式判断是否有表头：如果第一行包含“星期”或“开始节”
  const hasHeader = rows[0].some(p => p.includes("星期") || p.includes("开始") || p.includes("课程"));
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const results: ParsedCourse[] = [];
  for (const parts of dataRows) {
    // 预期格式：星期, 开始节, 结束节, 课程名称, 上课地点
    if (parts.length < 4) continue;

    const [dayStr, startStr, endStr, name, loc] = parts;
    const day = dayMap[dayStr] || 0;
    const startPeriod = parseInt(startStr);
    const endPeriod = parseInt(endStr);

    if (day > 0 && !isNaN(startPeriod) && !isNaN(endPeriod) && name) {
      results.push({
        name,
        day,
        startPeriod,
        endPeriod,
        location: loc || ""
      });
    }
  }
  return results;
}

export function parseSemesterCSV(csvText: string): ParsedCourse[] {
  const rows = parseRows(csvText);
  if (rows.length === 0) return [];

  const hasHeader = rows[0].some(p => p.includes("星期") || p.includes("开始") || p.includes("课程") || p.includes("周"));
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const results: ParsedCourse[] = [];
  for (const parts of dataRows) {
    // 预期格式：星期, 开始节, 结束节, 课程名称, 上课地点, 开始周, 结束周, 单双周
    if (parts.length < 6) continue;

    const [dayStr, startStr, endStr, name, loc, startWeekStr, endWeekStr, weekTypeStr] = parts;
    const day = dayMap[dayStr] || 0;
    const startPeriod = Number.parseInt(startStr, 10);
    const endPeriod = Number.parseInt(endStr, 10);
    const startWeek = parseWeek(startWeekStr, 1);
    const endWeek = parseWeek(endWeekStr, startWeek);

    if (day > 0 && !Number.isNaN(startPeriod) && !Number.isNaN(endPeriod) && name) {
      results.push({
        name,
        day,
        startPeriod,
        endPeriod,
        location: loc || "",
        startWeek: Math.min(startWeek, endWeek),
        endWeek: Math.max(startWeek, endWeek),
        weekType: parseWeekType(weekTypeStr)
      });
    }
  }

  return results;
}
