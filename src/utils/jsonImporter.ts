import type { Course, CourseSchedule } from "@/types/course";

export interface ImportResult {
  courses: Course[];
  schedules: CourseSchedule[];
  errors: string[];
}

export function parseCourseJson(json: string): ImportResult {
  // TODO: 解析并校验 JSON
  return { courses: [], schedules: [], errors: [] };
}
