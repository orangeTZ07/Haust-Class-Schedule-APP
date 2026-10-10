export interface Course {
  id: number;
  name: string;
  teacher?: string;
  location?: string;
  color: string;
}

export interface CourseTable {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseSchedule {
  id: number;
  courseId: number;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  startWeek: number;
  endWeek: number;
  weekType: "all" | "odd" | "even";
  scope?: "semester" | "weekly";
  isCancelled?: boolean;
  /// 这一次课自己的地点。教务数据里同一门课换教室是常态（实测：数据库原理 11 条活动散在 10 个教室），
  /// 而 `Course.location` 只有一个，所以导入时把每一行的教室写在这里。为空时回落到课程的地点 ——
  /// 老数据（这一列是后加的）、手填课、以及只改过一次课的覆盖层都是空的。
  location?: string;
  /// Set on segments written by a parser that knows its own rules. Absent on anything saved
  /// before that, and on manual / CSV / AI entries — those must not be relabelled after the fact.
  source?: string;
  parserVersion?: number;
}

export interface CourseImportItem {
  name: string;
  day: number;
  periods: string;
  loc?: string;
  teacher?: string;
}

/// One period's clock range, in minutes past midnight. end is exclusive of nothing special: 08:45
/// is 525, and the next period may start at 525 (no gap) but never before it.
export interface PeriodRange {
  start: number;
  end: number;
}

/// The day's clock. `periods` is the single source of truth: periods[0] is period 1, and the three
/// section counts say how it splits into 上午 / 下午 / 晚上 (their sum is always periods.length).
/// Breaks are not stored; they are simply the gap between one period's end and the next one's start.
export interface PeriodTimeConfig {
  morningPeriods: number;
  afternoonPeriods: number;
  eveningPeriods: number;
  periods: PeriodRange[];
}

export interface Reminder {
  id: number;
  courseScheduleId: number;
  minutesBefore: number;
  enabled: boolean;
}

export interface SemesterConfig {
  startDate: string;
  totalWeeks: number;
}
