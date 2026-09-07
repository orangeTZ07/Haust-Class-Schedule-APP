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
}

export interface CourseImportItem {
  name: string;
  day: number;
  periods: string;
  loc?: string;
  teacher?: string;
}

export interface PeriodTimeConfig {
  morningStart: string;
  afternoonStart: string;
  eveningStart: string;
  periodDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  morningPeriods: number;
  afternoonPeriods: number;
  eveningPeriods: number;
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
