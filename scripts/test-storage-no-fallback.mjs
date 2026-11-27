// App 里打不开 SQLite 时不再悄悄改用 localStorage（issue #54）。
//
// 跑的是真的 src/services/courseService.ts，只把 @tauri-apps/plugin-sql 换成内存里的假库：
// 能控制「打开失败几次」「哪条语句报错」，并记下每一条执行过的 SQL。
//
// 钉住的几件事：
//   1. App 里打开失败 → 抛 StorageUnavailableError，不读不写 web-fallback-*，记住的当前课表不被改回 1；
//   2. 失败会重试，之后的调用还能重新打开；同一时刻只开一次库；
//   3. 整理用的 UPDATE 失败不影响打开；
//   4. writeEditHistory 不再发 BEGIN / COMMIT / ROLLBACK（连接池上跨连接的事务会留下占着写锁的连接）；
//   5. 旧版本回退期间写进 localStorage 的课表会搬回 SQLite，且只搬一次；
//   6. 浏览器里（没有 Tauri）仍然用 localStorage。

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 下面会故意制造打开失败、语句被锁，服务层照常 console.error；这些是预期内的，不打出来。
console.error = () => {};

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

// ---------- 假的 localStorage ----------
const storage = new Map();
globalThis.localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};
const webKeys = () => [...storage.keys()].filter(key => key.startsWith("web-fallback-") && key !== "web-fallback-active-course-table-id");

// ---------- 假的 SQLite 插件 ----------
const fake = {
  loadCalls: 0,
  /// 接下来多少次 Database.load 要失败
  failLoads: 0,
  /// 返回 true 的语句会抛错
  failWhen: () => false,
  sql: [],
  tables: [{ id: 1, name: "默认课程表", created_at: "x", updated_at: "x" }],
  nextId: 100
};
const COURSE_COLUMNS = ["id", "table_id", "name", "teacher", "location", "color"].map(name => ({ name }));
const SCHEDULE_COLUMNS = [
  "id", "course_id", "day_of_week", "start_period", "end_period", "start_week", "end_week", "week_type",
  "scope", "is_cancelled", "source", "parser_version", "location", "teacher"
].map(name => ({ name }));

const fakeDb = {
  async execute(sql, params = []) {
    fake.sql.push({ sql: sql.trim(), params });
    if (fake.failWhen(sql)) throw new Error("database is locked");
    if (/^\s*INSERT INTO course_tables/.test(sql)) {
      const id = fake.nextId++;
      fake.tables.push({ id, name: params[0], created_at: params[1], updated_at: params[2] });
      return { lastInsertId: id, rowsAffected: 1 };
    }
    if (/^\s*DELETE FROM course_tables/.test(sql)) {
      fake.tables = fake.tables.filter(table => table.id !== params[0]);
    }
    return { lastInsertId: fake.nextId++, rowsAffected: 1 };
  },
  async select(sql) {
    fake.sql.push({ sql: sql.trim(), params: [] });
    if (sql.includes("COUNT(*)")) return [{ count: fake.tables.length }];
    if (sql.includes("PRAGMA table_info(courses)")) return COURSE_COLUMNS;
    if (sql.includes("PRAGMA table_info(schedules)")) return SCHEDULE_COLUMNS;
    if (sql.includes("FROM course_tables")) return fake.tables.map(table => ({ ...table }));
    return [];
  }
};
globalThis.__fakeSql = {
  load: async () => {
    fake.loadCalls++;
    if (fake.failLoads > 0) {
      fake.failLoads--;
      throw new Error("unable to open database file");
    }
    return fakeDb;
  }
};

// 每次 import 一份新打包的模块，模块级状态（打开中的库、恢复记录）就是全新的。
const bundle = await build({
  entryPoints: [join(root, "src/services/courseService.ts")],
  absWorkingDir: root,
  bundle: true,
  format: "esm",
  platform: "neutral",
  write: false,
  logLevel: "silent",
  plugins: [{
    name: "fake-plugin-sql",
    setup(b) {
      b.onResolve({ filter: /^@tauri-apps\/plugin-sql$/ }, () => ({ path: "sql", namespace: "fake" }));
      b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({
        contents: "export default { load: (...args) => globalThis.__fakeSql.load(...args) };",
        loader: "js"
      }));
    }
  }]
});
let copies = 0;
const freshService = async ({ tauri }) => {
  globalThis.window = tauri ? { __TAURI_INTERNALS__: {} } : {};
  const dir = mkdtempSync(join(tmpdir(), "storage-no-fallback-"));
  const file = join(dir, `service-${copies++}.mjs`);
  writeFileSync(file, bundle.outputFiles[0].text, "utf8");
  return import(pathToFileURL(file).href);
};
const resetFake = () => {
  fake.loadCalls = 0;
  fake.failLoads = 0;
  fake.failWhen = () => false;
  fake.sql = [];
};

console.log("=== 1. 打不开就明确失败，不碰 localStorage ===");
{
  storage.clear();
  storage.set("web-fallback-active-course-table-id", "5");
  resetFake();
  fake.failLoads = Infinity;
  const service = await freshService({ tauri: true });

  let error = null;
  try {
    await service.getCourseTables();
  } catch (e) {
    error = e;
  }
  check("抛出 StorageUnavailableError", error instanceof service.StorageUnavailableError, String(error));
  check("重试了 3 次", fake.loadCalls === 3, fake.loadCalls);
  check("没有写任何 web-fallback-* 数据", webKeys().length === 0, webKeys());

  let activeError = null;
  try {
    await service.getActiveCourseTableId();
  } catch (e) {
    activeError = e;
  }
  check("读当前课表也是失败，而不是退回 1", activeError instanceof service.StorageUnavailableError, String(activeError));
  check("记住的当前课表没有被改回 1", storage.get("web-fallback-active-course-table-id") === "5", storage.get("web-fallback-active-course-table-id"));

  // 库恢复之后，同一份模块里的下一次调用能重新打开。
  fake.failLoads = 0;
  fake.tables = [
    { id: 1, name: "默认课程表", created_at: "x", updated_at: "x" },
    { id: 5, name: "教务同步 11-27", created_at: "x", updated_at: "x" }
  ];
  const tables = await service.getCourseTables();
  check("库恢复后能读到 SQLite 里的课表", tables.length === 2 && tables[1].id === 5, tables);
  check("当前课表仍是 5 号", (await service.getActiveCourseTableId()) === 5);
}

console.log("");
console.log("=== 2. 失败一次后自动重试成功；同一时刻只开一次库 ===");
{
  storage.clear();
  resetFake();
  fake.failLoads = 1;
  const service = await freshService({ tauri: true });
  const [tables, courses] = await Promise.all([service.getCourseTables(), service.getAllCourses()]);
  check("第一次失败、第二次成功（共调用 2 次 load）", fake.loadCalls === 2, fake.loadCalls);
  check("两个并发调用都拿到了结果", Array.isArray(tables) && Array.isArray(courses));
  const creates = fake.sql.filter(entry => entry.sql.startsWith("CREATE TABLE IF NOT EXISTS course_tables")).length;
  check("迁移只跑了一遍（并发调用没有各开一次库）", creates === 1, creates);
}

console.log("");
console.log("=== 3. 整理用的 UPDATE 被锁住不影响打开 ===");
{
  storage.clear();
  resetFake();
  fake.failWhen = sql => /UPDATE schedules SET (location|teacher) = NULL/.test(sql);
  const service = await freshService({ tauri: true });
  let ok = true;
  try {
    await service.getCourseTables();
  } catch {
    ok = false;
  }
  check("库照常打开", ok);
  check("只 load 了一次（没有因为整理失败而重开）", fake.loadCalls === 1, fake.loadCalls);
}

console.log("");
console.log("=== 4. 回退记录不再跨连接开事务 ===");
{
  storage.clear();
  resetFake();
  const service = await freshService({ tauri: true });
  const snapshot = n => ({ courses: [{ id: n, name: `课${n}`, color: "#fff" }], schedules: [] });
  await service.writeEditHistory(5, { snapshots: [snapshot(1), snapshot(2), snapshot(3)], index: 2 });
  const statements = fake.sql.map(entry => entry.sql);
  check("没有 BEGIN / COMMIT / ROLLBACK", !statements.some(sql => /^(BEGIN|COMMIT|ROLLBACK)\b/.test(sql)), statements.filter(sql => /^(BEGIN|COMMIT|ROLLBACK)/.test(sql)));
  const inserts = fake.sql.filter(entry => entry.sql.startsWith("INSERT INTO edit_action_groups"));
  check("全部动作组用一条 INSERT 写回", inserts.length === 1, inserts.length);
  check("三组 × 4 个参数", inserts[0]?.params.length === 12, inserts[0]?.params.length);
  check("参数顺序是 table_id, position, courses, schedules", inserts[0]?.params[0] === 5 && inserts[0]?.params[5] === 1 && inserts[0]?.params[10].includes("课3"), inserts[0]?.params.slice(0, 6));
  check("当前位置写进 edit_history_heads", fake.sql.some(entry => entry.sql.startsWith("INSERT INTO edit_history_heads") && entry.params[1] === 2));
}

console.log("");
console.log("=== 5. 回退期间困在 localStorage 的课表搬回 SQLite ===");
{
  storage.clear();
  resetFake();
  fake.tables = [{ id: 1, name: "默认课程表", created_at: "x", updated_at: "x" }];
  storage.set("web-fallback-course-tables", JSON.stringify([
    { id: 1, name: "默认课程表" },
    { id: 2, name: "教务同步 11-26" },
    { id: 3, name: "空表" }
  ]));
  storage.set("web-fallback-courses", JSON.stringify([
    { id: 7, tableId: 2, name: "数据库原理", teacher: "李老师", location: "公教4-101", color: "#1989fa" },
    { id: 8, tableId: 2, name: "机器学习", color: "#07c160" }
  ]));
  storage.set("web-fallback-schedules", JSON.stringify([
    { id: 1, courseId: 7, dayOfWeek: 3, startPeriod: 1, endPeriod: 2, startWeek: 1, endWeek: 16, weekType: "all", scope: "semester", isCancelled: false, location: "公教5-316", teacher: "王老师", source: "eams", parserVersion: 3 },
    { id: 2, courseId: 8, dayOfWeek: 5, startPeriod: 3, endPeriod: 4, startWeek: 9, endWeek: 16, weekType: "odd", scope: "semester", isCancelled: false },
    { id: 3, courseId: 99, dayOfWeek: 1, startPeriod: 1, endPeriod: 2, startWeek: 1, endWeek: 16, weekType: "all" }
  ]));

  const service = await freshService({ tauri: true });
  await service.getCourseTables();

  const restoredTable = fake.tables.find(table => table.name === "教务同步 11-26（恢复）");
  check("有课程的表建成「原名（恢复）」", Boolean(restoredTable), fake.tables.map(table => table.name));
  check("没有课程的表不恢复", !fake.tables.some(table => table.name.startsWith("空表")) && !fake.tables.some(table => table.name === "默认课程表（恢复）"), fake.tables.map(table => table.name));

  const courseInserts = fake.sql.filter(entry => entry.sql.startsWith("INSERT INTO courses"));
  check("两门课写进新课表", courseInserts.length === 2 && courseInserts.every(entry => entry.params[0] === restoredTable?.id), courseInserts.map(entry => entry.params));

  const scheduleInserts = fake.sql.filter(entry => entry.sql.startsWith("INSERT INTO schedules"));
  check("找得到课程的两条课段写回，孤儿课段丢弃", scheduleInserts.length === 2, scheduleInserts.length);
  const first = scheduleInserts[0]?.params ?? [];
  check("课段指向新课程编号", first[0] !== 7 && courseInserts.length > 0, first[0]);
  check("课段的周次、教室、教师、来源原样带回", first[4] === 1 && first[5] === 16 && first[9] === "eams" && first[10] === 3 && first[11] === "公教5-316" && first[12] === "王老师", first);
  check("单双周带回", scheduleInserts[1]?.params[6] === "odd", scheduleInserts[1]?.params);

  check("搬完后 localStorage 里的旧数据删掉了", webKeys().length === 0, webKeys());
  const names = service.takeRecoveredTableNames();
  check("界面能取到恢复了哪些表", names.length === 1 && names[0] === "教务同步 11-26（恢复）", names);
  check("只取一次", service.takeRecoveredTableNames().length === 0);

  // 下一次启动（新模块）不会再恢复一遍。
  const before = fake.tables.length;
  resetFake();
  const again = await freshService({ tauri: true });
  await again.getCourseTables();
  check("再次启动不重复恢复", fake.tables.length === before && again.takeRecoveredTableNames().length === 0, fake.tables.length);
}

console.log("");
console.log("=== 6. 恢复写到一半失败：不留半张表，数据留到下次 ===");
{
  storage.clear();
  resetFake();
  fake.tables = [{ id: 1, name: "默认课程表", created_at: "x", updated_at: "x" }];
  storage.set("web-fallback-courses", JSON.stringify([{ id: 7, tableId: 2, name: "数据库原理", color: "#fff" }]));
  storage.set("web-fallback-schedules", JSON.stringify([
    { id: 1, courseId: 7, dayOfWeek: 3, startPeriod: 1, endPeriod: 2, startWeek: 1, endWeek: 16, weekType: "all" }
  ]));
  fake.failWhen = sql => /^\s*INSERT INTO schedules/.test(sql);
  const service = await freshService({ tauri: true });
  let opened = true;
  try {
    await service.getCourseTables();
  } catch {
    opened = false;
  }
  check("恢复失败不影响打开库", opened);
  check("半张表被删掉", fake.tables.length === 1, fake.tables.map(table => table.name));
  check("localStorage 里的数据还在，下次再试", storage.has("web-fallback-courses"));
}

console.log("");
console.log("=== 7. 浏览器里（没有 Tauri）仍然用 localStorage ===");
{
  storage.clear();
  resetFake();
  const service = await freshService({ tauri: false });
  const tables = await service.getCourseTables();
  check("返回 localStorage 里的默认课程表", tables.length === 1 && tables[0].name === "默认课程表", tables);
  check("没有碰 SQLite", fake.loadCalls === 0, fake.loadCalls);
}

console.log("");
console.log(failed === 0 ? "  ALL CHECKS PASSED" : "  " + failed + " CHECK(S) FAILED");
process.exit(failed ? 1 : 0);
