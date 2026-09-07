import Database from "@tauri-apps/plugin-sql";
import type { Course, CourseSchedule, CourseTable } from "@/types/course";

const DB_NAME = "sqlite:course_mngr.db";
const DEFAULT_TABLE_ID = 1;
let dbInstance: Database | null = null;

// 检测是否在 Tauri 环境中
const isTauri = !!(window as any).__TAURI_INTERNALS__;

export async function getDb() {
  if (!isTauri) return null;
  if (dbInstance) return dbInstance;
  try {
    dbInstance = await Database.load(DB_NAME);
    await initDb(dbInstance);
    return dbInstance;
  } catch (e) {
    console.error("Failed to load Tauri SQL plugin", e);
    return null;
  }
}

async function initDb(db: Database) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS course_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const tableCountRows = await db.select<Array<{ count: number }>>("SELECT COUNT(*) as count FROM course_tables");
  if ((tableCountRows[0]?.count ?? 0) === 0) {
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO course_tables (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)",
      [DEFAULT_TABLE_ID, "默认课程表", now, now]
    );
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      teacher TEXT,
      location TEXT,
      color TEXT NOT NULL,
      FOREIGN KEY (table_id) REFERENCES course_tables (id) ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_period INTEGER NOT NULL,
      end_period INTEGER NOT NULL,
      start_week INTEGER NOT NULL,
      end_week INTEGER NOT NULL,
      week_type TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'semester',
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
    );
  `);

  const courseColumns = await db.select<Array<{ name: string }>>("PRAGMA table_info(courses)");
  if (!courseColumns.some(column => column.name === "table_id")) {
    await db.execute("ALTER TABLE courses ADD COLUMN table_id INTEGER NOT NULL DEFAULT 1");
  }

  const scheduleColumns = await db.select<Array<{ name: string }>>("PRAGMA table_info(schedules)");
  if (!scheduleColumns.some(column => column.name === "scope")) {
    await db.execute("ALTER TABLE schedules ADD COLUMN scope TEXT NOT NULL DEFAULT 'semester'");
  }
  if (!scheduleColumns.some(column => column.name === "is_cancelled")) {
    await db.execute("ALTER TABLE schedules ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0");
  }
}

// --- Web Fallback Logic ---
const WEB_STORAGE_KEYS = {
  COURSES: "web-fallback-courses",
  SCHEDULES: "web-fallback-schedules",
  TABLES: "web-fallback-course-tables",
  ACTIVE_TABLE_ID: "web-fallback-active-course-table-id"
};

function normalizeSchedule(row: any): CourseSchedule {
  return {
    id: row.id,
    courseId: row.course_id ?? row.courseId,
    dayOfWeek: row.day_of_week ?? row.dayOfWeek,
    startPeriod: row.start_period ?? row.startPeriod,
    endPeriod: row.end_period ?? row.endPeriod,
    startWeek: row.start_week ?? row.startWeek,
    endWeek: row.end_week ?? row.endWeek,
    weekType: row.week_type ?? row.weekType,
    scope: (row.scope ?? "semester") as CourseSchedule["scope"],
    isCancelled: Boolean(row.is_cancelled ?? row.isCancelled ?? false)
  };
}

function normalizeCourseTable(row: any): CourseTable {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

async function ensureWebCourseTables(): Promise<CourseTable[]> {
  const data = localStorage.getItem(WEB_STORAGE_KEYS.TABLES);
  const parsed = data ? JSON.parse(data) as CourseTable[] : [];
  if (parsed.length > 0) return parsed;

  const now = new Date().toISOString();
  const defaultTable: CourseTable = {
    id: DEFAULT_TABLE_ID,
    name: "默认课程表",
    createdAt: now,
    updatedAt: now
  };
  localStorage.setItem(WEB_STORAGE_KEYS.TABLES, JSON.stringify([defaultTable]));
  localStorage.setItem(WEB_STORAGE_KEYS.ACTIVE_TABLE_ID, String(DEFAULT_TABLE_ID));
  return [defaultTable];
}

export async function getCourseTables(): Promise<CourseTable[]> {
  const db = await getDb();
  if (db) {
    const rows = await db.select<any[]>("SELECT * FROM course_tables ORDER BY id ASC");
    return rows.map(normalizeCourseTable);
  }

  return await ensureWebCourseTables();
}

export async function getActiveCourseTableId(): Promise<number> {
  const tables = await getCourseTables();
  const savedId = Number(localStorage.getItem(WEB_STORAGE_KEYS.ACTIVE_TABLE_ID));
  if (tables.some(table => table.id === savedId)) return savedId;

  const fallbackId = tables[0]?.id ?? DEFAULT_TABLE_ID;
  localStorage.setItem(WEB_STORAGE_KEYS.ACTIVE_TABLE_ID, String(fallbackId));
  return fallbackId;
}

export async function setActiveCourseTableId(id: number): Promise<void> {
  const tables = await getCourseTables();
  if (!tables.some(table => table.id === id)) return;
  localStorage.setItem(WEB_STORAGE_KEYS.ACTIVE_TABLE_ID, String(id));
}

export async function addCourseTable(name: string): Promise<number> {
  const now = new Date().toISOString();
  const db = await getDb();
  if (db) {
    const result = await db.execute(
      "INSERT INTO course_tables (name, created_at, updated_at) VALUES ($1, $2, $3)",
      [name, now, now]
    );
    return result.lastInsertId ?? DEFAULT_TABLE_ID;
  }

  const tables = await ensureWebCourseTables();
  const id = tables.length > 0 ? Math.max(...tables.map(table => table.id)) + 1 : DEFAULT_TABLE_ID;
  tables.push({ id, name, createdAt: now, updatedAt: now });
  localStorage.setItem(WEB_STORAGE_KEYS.TABLES, JSON.stringify(tables));
  return id;
}

export async function renameCourseTable(id: number, name: string): Promise<void> {
  const now = new Date().toISOString();
  const db = await getDb();
  if (db) {
    await db.execute(
      "UPDATE course_tables SET name = $1, updated_at = $2 WHERE id = $3",
      [name, now, id]
    );
    return;
  }

  const tables = await ensureWebCourseTables();
  const index = tables.findIndex(table => table.id === id);
  if (index === -1) return;
  tables[index] = { ...tables[index], name, updatedAt: now };
  localStorage.setItem(WEB_STORAGE_KEYS.TABLES, JSON.stringify(tables));
}

export async function deleteCourseTable(id: number): Promise<void> {
  const tables = await getCourseTables();
  if (tables.length <= 1) return;

  const db = await getDb();
  if (db) {
    await db.execute("DELETE FROM schedules WHERE course_id IN (SELECT id FROM courses WHERE table_id = $1)", [id]);
    await db.execute("DELETE FROM courses WHERE table_id = $1", [id]);
    await db.execute("DELETE FROM course_tables WHERE id = $1", [id]);
  } else {
    const webCourses = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.COURSES) || "[]") as Array<Course & { tableId?: number }>;
    const deletedCourseIds = new Set(webCourses.filter(course => (course.tableId ?? DEFAULT_TABLE_ID) === id).map(course => course.id));
    const webSchedules = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.SCHEDULES) || "[]") as CourseSchedule[];
    localStorage.setItem(
      WEB_STORAGE_KEYS.COURSES,
      JSON.stringify(webCourses.filter(course => (course.tableId ?? DEFAULT_TABLE_ID) !== id))
    );
    localStorage.setItem(
      WEB_STORAGE_KEYS.SCHEDULES,
      JSON.stringify(webSchedules.filter(schedule => !deletedCourseIds.has(schedule.courseId)))
    );
    localStorage.setItem(WEB_STORAGE_KEYS.TABLES, JSON.stringify(tables.filter(table => table.id !== id)));
  }

  const activeId = await getActiveCourseTableId();
  if (activeId === id) {
    const remaining = (await getCourseTables()).filter(table => table.id !== id);
    if (remaining[0]) {
      await setActiveCourseTableId(remaining[0].id);
    }
  }
}

export async function getAllCourses(): Promise<Course[]> {
  const db = await getDb();
  const tableId = await getActiveCourseTableId();
  if (db) {
    return await db.select<Course[]>(
      "SELECT id, name, teacher, location, color FROM courses WHERE table_id = $1 ORDER BY id ASC",
      [tableId]
    );
  } else {
    const data = localStorage.getItem(WEB_STORAGE_KEYS.COURSES);
    const courses = data ? JSON.parse(data) as Array<Course & { tableId?: number }> : [];
    return courses
      .filter(course => (course.tableId ?? DEFAULT_TABLE_ID) === tableId)
      .map(({ tableId: _tableId, ...course }) => course);
  }
}

export async function getAllSchedules(): Promise<CourseSchedule[]> {
  const db = await getDb();
  const tableId = await getActiveCourseTableId();
  if (db) {
    const rows = await db.select<any[]>(
      `SELECT schedules.*
       FROM schedules
       INNER JOIN courses ON courses.id = schedules.course_id
       WHERE courses.table_id = $1
       ORDER BY schedules.id ASC`,
      [tableId]
    );
    return rows.map(normalizeSchedule);
  } else {
    const data = localStorage.getItem(WEB_STORAGE_KEYS.SCHEDULES);
    const schedules = data ? JSON.parse(data) as CourseSchedule[] : [];
    const activeCourses = await getAllCourses();
    const activeCourseIds = new Set(activeCourses.map(course => course.id));
    return schedules
      .map(normalizeSchedule)
      .filter(schedule => activeCourseIds.has(schedule.courseId));
  }
}

export async function addCourse(course: Omit<Course, "id">): Promise<number> {
  const db = await getDb();
  const tableId = await getActiveCourseTableId();
  if (db) {
    const result = await db.execute(
      "INSERT INTO courses (table_id, name, teacher, location, color) VALUES ($1, $2, $3, $4, $5)",
      [tableId, course.name, course.teacher || "", course.location || "", course.color]
    );
    return result.lastInsertId ?? 0;
  } else {
    const courses = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.COURSES) || "[]") as Array<Course & { tableId?: number }>;
    const id = courses.length > 0 ? Math.max(...courses.map(c => c.id)) + 1 : 1;
    courses.push({ id, ...course, tableId });
    localStorage.setItem(WEB_STORAGE_KEYS.COURSES, JSON.stringify(courses));
    return id;
  }
}

export async function addSchedule(schedule: Omit<CourseSchedule, "id">): Promise<number> {
  const db = await getDb();
  const scope = schedule.scope ?? "semester";
  const isCancelled = schedule.isCancelled ? 1 : 0;
  if (db) {
    const result = await db.execute(
      "INSERT INTO schedules (course_id, day_of_week, start_period, end_period, start_week, end_week, week_type, scope, is_cancelled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [schedule.courseId, schedule.dayOfWeek, schedule.startPeriod, schedule.endPeriod, schedule.startWeek, schedule.endWeek, schedule.weekType, scope, isCancelled]
    );
    return result.lastInsertId ?? 0;
  } else {
    const schedules = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.SCHEDULES) || "[]") as CourseSchedule[];
    const id = schedules.length > 0 ? Math.max(...schedules.map(s => s.id)) + 1 : 1;
    schedules.push({ id, ...schedule, scope, isCancelled: Boolean(schedule.isCancelled) });
    localStorage.setItem(WEB_STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
    return id;
  }
}

export async function updateSchedule(schedule: CourseSchedule): Promise<void> {
  const db = await getDb();
  const scope = schedule.scope ?? "semester";
  const isCancelled = schedule.isCancelled ? 1 : 0;
  if (db) {
    await db.execute(
      "UPDATE schedules SET course_id = $1, day_of_week = $2, start_period = $3, end_period = $4, start_week = $5, end_week = $6, week_type = $7, scope = $8, is_cancelled = $9 WHERE id = $10",
      [
        schedule.courseId,
        schedule.dayOfWeek,
        schedule.startPeriod,
        schedule.endPeriod,
        schedule.startWeek,
        schedule.endWeek,
        schedule.weekType,
        scope,
        isCancelled,
        schedule.id
      ]
    );
  } else {
    const schedules = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.SCHEDULES) || "[]") as CourseSchedule[];
    const index = schedules.findIndex(s => s.id === schedule.id);
    if (index === -1) return;
    schedules[index] = { ...schedule, scope, isCancelled: Boolean(schedule.isCancelled) };
    localStorage.setItem(WEB_STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
  }
}

export async function clearWeeklySchedulesForWeek(week: number): Promise<void> {
  const db = await getDb();
  const tableId = await getActiveCourseTableId();
  if (db) {
    await db.execute(
      "DELETE FROM schedules WHERE scope = 'weekly' AND start_week = $1 AND end_week = $1 AND course_id IN (SELECT id FROM courses WHERE table_id = $2)",
      [week, tableId]
    );
    return;
  }

  const activeCourses = await getAllCourses();
  const activeCourseIds = new Set(activeCourses.map(course => course.id));
  const schedules = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.SCHEDULES) || "[]") as CourseSchedule[];
  localStorage.setItem(
    WEB_STORAGE_KEYS.SCHEDULES,
    JSON.stringify(
      schedules.filter(schedule => !(
        schedule.scope === "weekly" &&
        schedule.startWeek === week &&
        schedule.endWeek === week &&
        activeCourseIds.has(schedule.courseId)
      ))
    )
  );
}

export async function clearAllData() {
  const db = await getDb();
  const tableId = await getActiveCourseTableId();
  if (db) {
    await db.execute("DELETE FROM schedules WHERE course_id IN (SELECT id FROM courses WHERE table_id = $1)", [tableId]);
    await db.execute("DELETE FROM courses WHERE table_id = $1", [tableId]);
  } else {
    const courses = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.COURSES) || "[]") as Array<Course & { tableId?: number }>;
    const deletedCourseIds = new Set(courses.filter(c => (c.tableId ?? DEFAULT_TABLE_ID) === tableId).map(c => c.id));
    const schedules = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.SCHEDULES) || "[]") as CourseSchedule[];
    localStorage.setItem(
      WEB_STORAGE_KEYS.COURSES,
      JSON.stringify(courses.filter(c => (c.tableId ?? DEFAULT_TABLE_ID) !== tableId))
    );
    localStorage.setItem(
      WEB_STORAGE_KEYS.SCHEDULES,
      JSON.stringify(schedules.filter(s => !deletedCourseIds.has(s.courseId)))
    );
  }
}

export async function deleteCourse(id: number) {
  const db = await getDb();
  if (db) {
    await db.execute("DELETE FROM courses WHERE id = $1", [id]);
  } else {
    const courses = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.COURSES) || "[]") as Array<Course & { tableId?: number }>;
    const filteredCourses = courses.filter(c => c.id !== id);
    localStorage.setItem(WEB_STORAGE_KEYS.COURSES, JSON.stringify(filteredCourses));
    
    // Also cleanup schedules in web fallback since there's no FK cascade
    const schedules = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.SCHEDULES) || "[]") as CourseSchedule[];
    const filteredSchedules = schedules.filter(s => s.courseId !== id);
    localStorage.setItem(WEB_STORAGE_KEYS.SCHEDULES, JSON.stringify(filteredSchedules));
  }
}

export async function deleteSchedule(id: number) {
  const db = await getDb();
  if (db) {
    await db.execute("DELETE FROM schedules WHERE id = $1", [id]);
  } else {
    const schedules = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.SCHEDULES) || "[]") as CourseSchedule[];
    const filteredSchedules = schedules.filter(s => s.id !== id);
    localStorage.setItem(WEB_STORAGE_KEYS.SCHEDULES, JSON.stringify(filteredSchedules));
  }
}
