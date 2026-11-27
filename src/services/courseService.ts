import Database from "@tauri-apps/plugin-sql";
import type { Course, CourseSchedule, CourseTable } from "@/types/course";
import {
  capHistory,
  forgetTableHistory,
  normalizeHistory,
  readTableHistory,
  writeTableHistory,
  type TableHistory
} from "@/utils/editHistory";

const DB_NAME = "sqlite:course_mngr.db";
const DEFAULT_TABLE_ID = 1;

// 检测是否在 Tauri 环境中
const isTauri = !!(window as any).__TAURI_INTERNALS__;

/// App 里打不开 SQLite 时抛出的错误。
///
/// 以前这里返回 null，于是每个读写函数都悄悄改用浏览器的 localStorage：那里是空的，课表就显示
/// 成一张空表；getActiveCourseTableId 还会把记住的当前课表改回 1 号，下次 SQLite 能打开了，
/// 用户看到的仍然是空的「默认课程表」，导入的课表躲在「选择课程表」里（issue #54）。
/// 现在 App 里只认 SQLite：打不开就明确失败，由界面提示重试，绝不写到别处去。
export class StorageUnavailableError extends Error {
  constructor(readonly cause: unknown) {
    super("无法打开本地课表数据库");
    this.name = "StorageUnavailableError";
  }
}

const DB_OPEN_ATTEMPTS = 3;
const DB_RETRY_BASE_MS = 300;

/// 同一时刻只开一次库：第一次 initDb 还没跑完，第二个调用者就拿到库的话，迁移和查询会撞在一起
/// （以前 dbInstance 在 initDb 之前就赋值了）。失败时清空，下一次调用会重新尝试。
let dbOpening: Promise<Database> | null = null;

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function openDb(): Promise<Database> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DB_OPEN_ATTEMPTS; attempt++) {
    try {
      const db = await Database.load(DB_NAME);
      await initDb(db);
      try {
        await adoptStrandedWebData(db);
      } catch (error) {
        // 恢复失败不影响正常使用：数据还留在 localStorage，下次启动再试。
        console.error("Failed to move fallback data into SQLite", error);
      }
      return db;
    } catch (error) {
      lastError = error;
      console.error(`Failed to open SQLite (attempt ${attempt}/${DB_OPEN_ATTEMPTS})`, error);
      // 多半是库被短暂锁住（上一次进程还没退干净、另一条连接正在写），稍等再试。
      if (attempt < DB_OPEN_ATTEMPTS) await delay(DB_RETRY_BASE_MS * attempt);
    }
  }
  throw new StorageUnavailableError(lastError);
}

/// 浏览器里（没有 Tauri）返回 null，调用方改用 localStorage，这只是给开发调试用的。
/// App 里要么返回已经迁移好的库，要么抛 StorageUnavailableError，不会返回 null。
export async function getDb(): Promise<Database | null> {
  if (!isTauri) return null;
  if (!dbOpening) {
    dbOpening = openDb().catch(error => {
      dbOpening = null;
      throw error;
    });
  }
  return dbOpening;
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
      source TEXT,
      parser_version INTEGER,
      teacher TEXT,
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
  // Nullable on purpose: rows written before provenance existed, and hand-entered segments,
  // stay null. A default of "eams" would make a later migration rewrite the wrong courses.
  if (!scheduleColumns.some(column => column.name === "source")) {
    await db.execute("ALTER TABLE schedules ADD COLUMN source TEXT");
  }
  if (!scheduleColumns.some(column => column.name === "parser_version")) {
    await db.execute("ALTER TABLE schedules ADD COLUMN parser_version INTEGER");
  }
  // 课段自己的地点。加这一列之前，地点只能挂在课程上，于是教务导入时同一门课的多个教室被
  // 「取出现次数最多的那个」压成一个 —— 数据库原理 11 条活动散在 10 个教室，最后全表都显示
  // 同一个教室。老行留 null，显示时回落到 courses.location，所以升级后旧数据外观不变。
  if (!scheduleColumns.some(column => column.name === "location")) {
    await db.execute("ALTER TABLE schedules ADD COLUMN location TEXT");
  }
  // 课段自己的教师。和 location 同一套理由：course.teacher 只有一个，而教务里同一门课的
  // 不同活动可能由不同老师上（实测：数据库原理 6 位、前端开发技术 3 位）。老行留 null，
  // 显示时回落到 courses.teacher，所以升级后旧数据外观不变。
  if (!scheduleColumns.some(column => column.name === "teacher")) {
    await db.execute("ALTER TABLE schedules ADD COLUMN teacher TEXT");
  }

  // 收拢一次历史数据：课段地点和课程地点完全相同时，它就是冗余的（显示回落完全相同，
  // 但会挡住"改课程地点"——卡片读课段、编辑框读课程，看起来像没保存）。
  // 幂等：清掉之后显示的值一个字都不变，重复执行没有副作用，所以不需要版本号。
  //
  // 这两条是整理，不是建表：它们每次启动都要拿写锁，库被短暂锁住时会失败。失败就留到下次启动，
  // 不能因此让整个库「打不开」。
  try {
    await db.execute(`
      UPDATE schedules SET location = NULL
      WHERE location IS NOT NULL
        AND location = (SELECT c.location FROM courses c WHERE c.id = schedules.course_id)
    `);
    // 教师同理：课段上的教师和课程教师一样时就是冗余，清掉不改变任何显示，
    // 但能让「整学期改教师」真正生效（卡片/详情读课段优先）。
    await db.execute(`
      UPDATE schedules SET teacher = NULL
      WHERE teacher IS NOT NULL
        AND teacher = (SELECT c.teacher FROM courses c WHERE c.id = schedules.course_id)
    `);
  } catch (error) {
    console.error("Skipped the redundant location/teacher cleanup", error);
  }

  // One row per action group (the timetable after one user gesture), capped per course table.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS edit_action_groups (
      table_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      courses_json TEXT NOT NULL,
      schedules_json TEXT NOT NULL,
      PRIMARY KEY (table_id, position)
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS edit_history_heads (
      table_id INTEGER PRIMARY KEY,
      current_index INTEGER NOT NULL
    );
  `);
}

// --- Web Fallback Logic ---
// 只在浏览器里（没有 Tauri）使用。ACTIVE_TABLE_ID 例外：App 里也用它记住当前课表。
const WEB_STORAGE_KEYS = {
  COURSES: "web-fallback-courses",
  SCHEDULES: "web-fallback-schedules",
  TABLES: "web-fallback-course-tables",
  ACTIVE_TABLE_ID: "web-fallback-active-course-table-id"
};

/// 本次启动从 localStorage 搬回 SQLite 的课表名称，界面取走一次后清空。
let recoveredTableNames: string[] = [];

export function takeRecoveredTableNames(): string[] {
  const names = recoveredTableNames;
  recoveredTableNames = [];
  return names;
}

const readJsonArray = (key: string): any[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/// 把旧版本在 App 里「打不开 SQLite 时」悄悄写进 localStorage 的课表搬回 SQLite。
///
/// 旧版本打不开库时会改写 localStorage：那段时间里新导入或编辑的课程只存在那里，下次库能打开，
/// 它们就再也看不到了。这里每张有课程的表各建一张新课表（名称后加「（恢复）」），
/// 全部写完才删掉 localStorage 里的那份；某张表写到一半失败，就把这张表删掉再抛出，
/// 下次启动重来，不会留下半张表，也不会重复。
async function adoptStrandedWebData(db: Database): Promise<void> {
  const webCourses = readJsonArray(WEB_STORAGE_KEYS.COURSES) as Array<Course & { tableId?: number }>;
  const clearStranded = () => {
    localStorage.removeItem(WEB_STORAGE_KEYS.COURSES);
    localStorage.removeItem(WEB_STORAGE_KEYS.SCHEDULES);
    localStorage.removeItem(WEB_STORAGE_KEYS.TABLES);
  };
  if (webCourses.length === 0) {
    clearStranded();
    return;
  }

  const webSchedules = readJsonArray(WEB_STORAGE_KEYS.SCHEDULES).map(normalizeSchedule);
  const webTables = readJsonArray(WEB_STORAGE_KEYS.TABLES) as CourseTable[];
  const tableNames = new Map(webTables.map(table => [table.id, table.name]));

  const coursesByTable = new Map<number, Array<Course & { tableId?: number }>>();
  for (const course of webCourses) {
    const tableId = course.tableId ?? DEFAULT_TABLE_ID;
    if (!coursesByTable.has(tableId)) coursesByTable.set(tableId, []);
    coursesByTable.get(tableId)!.push(course);
  }

  const restored: string[] = [];
  for (const [webTableId, tableCourses] of coursesByTable) {
    const now = new Date().toISOString();
    const name = `${tableNames.get(webTableId) || "课程表"}（恢复）`;
    const created = await db.execute(
      "INSERT INTO course_tables (name, created_at, updated_at) VALUES ($1, $2, $3)",
      [name, now, now]
    );
    const tableId = created.lastInsertId;
    if (typeof tableId !== "number") {
      // 拿不到编号就没法往里写；按名称删掉刚建的那张空表，免得留下一张空的「（恢复）」。
      await db.execute(
        "DELETE FROM course_tables WHERE name = $1 AND id NOT IN (SELECT DISTINCT table_id FROM courses)",
        [name]
      ).catch(cleanupError => console.error("Failed to remove the empty recovered table", cleanupError));
      throw new Error("恢复课表时没有拿到新课表的编号");
    }

    try {
      const idMap = new Map<number, number>();
      for (const course of tableCourses) {
        const inserted = await db.execute(
          "INSERT INTO courses (table_id, name, teacher, location, color) VALUES ($1, $2, $3, $4, $5)",
          [tableId, course.name || "未命名课程", course.teacher || "", course.location || "", course.color || "#1989fa"]
        );
        if (typeof inserted.lastInsertId === "number") idMap.set(course.id, inserted.lastInsertId);
      }
      for (const schedule of webSchedules) {
        const courseId = idMap.get(schedule.courseId);
        if (courseId === undefined) continue;
        await db.execute(
          "INSERT INTO schedules (course_id, day_of_week, start_period, end_period, start_week, end_week, week_type, scope, is_cancelled, source, parser_version, location, teacher) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
          [
            courseId,
            schedule.dayOfWeek,
            schedule.startPeriod,
            schedule.endPeriod,
            schedule.startWeek,
            schedule.endWeek,
            schedule.weekType,
            schedule.scope ?? "semester",
            schedule.isCancelled ? 1 : 0,
            schedule.source ?? null,
            schedule.parserVersion ?? null,
            schedule.location ?? null,
            schedule.teacher ?? null
          ]
        );
      }
    } catch (error) {
      // 回滚本身也可能失败（库又被锁住）：记下来，抛出最初的那个错误。
      try {
        await db.execute("DELETE FROM schedules WHERE course_id IN (SELECT id FROM courses WHERE table_id = $1)", [tableId]);
        await db.execute("DELETE FROM courses WHERE table_id = $1", [tableId]);
        await db.execute("DELETE FROM course_tables WHERE id = $1", [tableId]);
      } catch (cleanupError) {
        console.error("Failed to remove the half-recovered table", cleanupError);
      }
      throw error;
    }
    restored.push(name);
    // 写完一张就从 localStorage 里划掉一张：后面某张表失败时，下次启动不会把这张再恢复一遍。
    const done = new Set(tableCourses.map(course => course.id));
    localStorage.setItem(
      WEB_STORAGE_KEYS.COURSES,
      JSON.stringify(readJsonArray(WEB_STORAGE_KEYS.COURSES).filter((course: Course) => !done.has(course.id)))
    );
    recoveredTableNames = [...restored];
  }

  clearStranded();
}

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
    isCancelled: Boolean(row.is_cancelled ?? row.isCancelled ?? false),
    location: typeof row.location === "string" && row.location ? row.location : undefined,
    teacher: typeof row.teacher === "string" && row.teacher ? row.teacher : undefined,
    source: typeof row.source === "string" && row.source ? row.source : undefined,
    parserVersion: typeof (row.parser_version ?? row.parserVersion) === "number"
      ? (row.parser_version ?? row.parserVersion)
      : undefined
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
    await db.execute("DELETE FROM edit_action_groups WHERE table_id = $1", [id]);
    await db.execute("DELETE FROM edit_history_heads WHERE table_id = $1", [id]);
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
    forgetTableHistory(localStorage, id);
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

export async function updateCourse(course: Course): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.execute(
      "UPDATE courses SET name = $1, teacher = $2, location = $3, color = $4 WHERE id = $5",
      [course.name, course.teacher || "", course.location || "", course.color, course.id]
    );
  } else {
    const courses = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.COURSES) || "[]") as Array<Course & { tableId?: number }>;
    const index = courses.findIndex(item => item.id === course.id);
    if (index === -1) return;
    courses[index] = { ...courses[index], ...course };
    localStorage.setItem(WEB_STORAGE_KEYS.COURSES, JSON.stringify(courses));
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
      "INSERT INTO schedules (course_id, day_of_week, start_period, end_period, start_week, end_week, week_type, scope, is_cancelled, source, parser_version, location, teacher) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
      [schedule.courseId, schedule.dayOfWeek, schedule.startPeriod, schedule.endPeriod, schedule.startWeek, schedule.endWeek, schedule.weekType, scope, isCancelled, schedule.source ?? null, schedule.parserVersion ?? null, schedule.location ?? null, schedule.teacher ?? null]
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
      "UPDATE schedules SET course_id = $1, day_of_week = $2, start_period = $3, end_period = $4, start_week = $5, end_week = $6, week_type = $7, scope = $8, is_cancelled = $9, source = $10, parser_version = $11, location = $12, teacher = $13 WHERE id = $14",
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
        schedule.source ?? null,
        schedule.parserVersion ?? null,
        schedule.location ?? null,
        schedule.teacher ?? null,
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

/// Put one course table back to a snapshot, including the original ids, so a later edit
/// does not collide with a row undo just restored.
export async function replaceActiveTableContents(nextCourses: Course[], nextSchedules: CourseSchedule[]): Promise<void> {
  const tableId = await getActiveCourseTableId();
  const db = await getDb();
  if (db) {
    await db.execute(
      "DELETE FROM schedules WHERE course_id IN (SELECT id FROM courses WHERE table_id = $1)",
      [tableId]
    );
    await db.execute("DELETE FROM courses WHERE table_id = $1", [tableId]);
    for (const course of nextCourses) {
      await db.execute(
        "INSERT INTO courses (id, table_id, name, teacher, location, color) VALUES ($1, $2, $3, $4, $5, $6)",
        [course.id, tableId, course.name, course.teacher || "", course.location || "", course.color]
      );
    }
    for (const schedule of nextSchedules) {
      const scope = schedule.scope ?? "semester";
      const isCancelled = schedule.isCancelled ? 1 : 0;
      await db.execute(
        "INSERT INTO schedules (id, course_id, day_of_week, start_period, end_period, start_week, end_week, week_type, scope, is_cancelled, location, teacher) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [
          schedule.id,
          schedule.courseId,
          schedule.dayOfWeek,
          schedule.startPeriod,
          schedule.endPeriod,
          schedule.startWeek,
          schedule.endWeek,
          schedule.weekType,
          scope,
          isCancelled,
          // 撤销/重做走这条路把整表写回，漏掉这一列就等于「按一次撤销，所有课段的地点/老师都没了」。
          schedule.location ?? null,
          schedule.teacher ?? null
        ]
      );
    }
    return;
  }

  const storedCourses = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.COURSES) || "[]") as Array<Course & { tableId?: number }>;
  const removedIds = new Set(
    storedCourses.filter(course => (course.tableId ?? DEFAULT_TABLE_ID) === tableId).map(course => course.id)
  );
  for (const course of nextCourses) removedIds.add(course.id);
  const keptCourses = storedCourses.filter(course => (course.tableId ?? DEFAULT_TABLE_ID) !== tableId && !removedIds.has(course.id));
  const restoredCourses = nextCourses.map(course => ({ ...course, tableId }));
  localStorage.setItem(WEB_STORAGE_KEYS.COURSES, JSON.stringify([...keptCourses, ...restoredCourses]));

  const storedSchedules = JSON.parse(localStorage.getItem(WEB_STORAGE_KEYS.SCHEDULES) || "[]") as CourseSchedule[];
  const restoredIds = new Set(nextSchedules.map(schedule => schedule.id));
  const keptSchedules = storedSchedules.filter(schedule => !removedIds.has(schedule.courseId) && !restoredIds.has(schedule.id));
  localStorage.setItem(WEB_STORAGE_KEYS.SCHEDULES, JSON.stringify([...keptSchedules, ...nextSchedules]));
}

/// Action groups for one course table. SQLite on the phone; localStorage when there is no database.
/// At most 500 groups are kept. Older ones are already dropped before this is called.
export async function readEditHistory(tableId: number): Promise<TableHistory | null> {
  const db = await getDb();
  if (!db) return readTableHistory(localStorage, tableId);

  try {
    const rows = await db.select<Array<{ position: number; courses_json: string; schedules_json: string }>>(
      "SELECT position, courses_json, schedules_json FROM edit_action_groups WHERE table_id = $1 ORDER BY position ASC",
      [tableId]
    );
    if (rows.length === 0) return null;
    const heads = await db.select<Array<{ current_index: number }>>(
      "SELECT current_index FROM edit_history_heads WHERE table_id = $1",
      [tableId]
    );
    const snapshots = rows.map(row => ({
      courses: JSON.parse(row.courses_json),
      schedules: JSON.parse(row.schedules_json)
    }));
    return normalizeHistory({
      snapshots,
      index: heads[0]?.current_index ?? snapshots.length - 1
    });
  } catch (e) {
    console.error("Failed to read edit history", e);
    return null;
  }
}

export async function writeEditHistory(tableId: number, history: TableHistory): Promise<void> {
  const capped = capHistory(history);
  const db = await getDb();
  if (!db) {
    writeTableHistory(localStorage, tableId, capped);
    return;
  }

  // 不用 BEGIN / COMMIT：插件的每次 execute 都从连接池里随便取一条连接，BEGIN 和 COMMIT 可能
  // 落在两条连接上。COMMIT 报「没有进行中的事务」，而开了事务的那条连接一直占着写锁，之后的写入
  // 要么「database is locked」，要么写进一个永远不提交的事务里，重启就没了；下次启动连迁移都可能
  // 拿不到锁，库就「打不开」了（issue #54）。
  //
  // 所以改成各自原子的单条语句：先用一条多行 INSERT OR REPLACE 写入全部动作组，再删掉多出来的
  // 旧位置。写入失败时库里还是上一份完整的记录，不会出现「删了、没写进去」的空档。
  if (capped.snapshots.length === 0) {
    await db.execute("DELETE FROM edit_action_groups WHERE table_id = $1", [tableId]);
    await db.execute("DELETE FROM edit_history_heads WHERE table_id = $1", [tableId]);
    return;
  }

  const rows: string[] = [];
  const values: unknown[] = [];
  capped.snapshots.forEach((snapshot, position) => {
    const base = values.length;
    rows.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    values.push(tableId, position, JSON.stringify(snapshot.courses), JSON.stringify(snapshot.schedules));
  });
  await db.execute(
    `INSERT OR REPLACE INTO edit_action_groups (table_id, position, courses_json, schedules_json) VALUES ${rows.join(", ")}`,
    values
  );
  await db.execute(
    "DELETE FROM edit_action_groups WHERE table_id = $1 AND position >= $2",
    [tableId, capped.snapshots.length]
  );
  await db.execute(
    `INSERT INTO edit_history_heads (table_id, current_index) VALUES ($1, $2)
     ON CONFLICT(table_id) DO UPDATE SET current_index = excluded.current_index`,
    [tableId, capped.index]
  );
}

export async function forgetEditHistory(tableId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    forgetTableHistory(localStorage, tableId);
    return;
  }
  await db.execute("DELETE FROM edit_action_groups WHERE table_id = $1", [tableId]);
  await db.execute("DELETE FROM edit_history_heads WHERE table_id = $1", [tableId]);
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
