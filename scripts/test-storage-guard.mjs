// 读库失败之后，useCourses 不能拿着不可信的内存状态去改写课表（issue #54 的审查意见）。
//
// 跑的是真的 src/composables/useCourses.ts，只把 courseService 换成内存实现：先让它「打不开」，
// 再让它恢复，断言：
//   1. 读库失败时，节次、学期开始日期等 localStorage 设置照常读到，不会被默认值覆盖；
//   2. 库仍然打不开时，导入、覆盖、清空都直接失败，一条删除语句都不发；
//   3. 库恢复后，第一次改写前会先重读，当前课表回到真正的那一张，课程也读回来；
//   4. 导入为新课表时返回新课表的编号（考试安排据此保存）。

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
console.error = () => {};

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const storage = new Map();
globalThis.localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};
// 用户自己的设置：读库失败也不能丢。
storage.set("course-mngr-semester-start", "2026-09-07");
storage.set("course-mngr-current-week", "7");

const clone = value => JSON.parse(JSON.stringify(value));
const state = {
  broken: true,
  calls: [],
  tables: [{ id: 1, name: "默认课程表" }, { id: 5, name: "教务同步 11-26" }],
  activeId: 5,
  courses: { 1: [], 5: [{ id: 11, name: "数据库原理", color: "#fff" }] },
  schedules: { 1: [], 5: [{ id: 21, courseId: 11, dayOfWeek: 3, startPeriod: 1, endPeriod: 2, startWeek: 1, endWeek: 16, weekType: "all", scope: "semester" }] },
  nextId: 100
};
const unavailable = () => {
  const error = new Error("无法打开本地课表数据库");
  error.name = "StorageUnavailableError";
  return error;
};
const guard = name => {
  state.calls.push(name);
  if (state.broken) throw unavailable();
};
const service = {
  getCourseTables: async () => { guard("getCourseTables"); return clone(state.tables); },
  getActiveCourseTableId: async () => { guard("getActiveCourseTableId"); return state.activeId; },
  setActiveCourseTableId: async id => { guard("setActiveCourseTableId"); state.activeId = id; },
  getAllCourses: async () => { guard("getAllCourses"); return clone(state.courses[state.activeId] ?? []); },
  getAllSchedules: async () => { guard("getAllSchedules"); return clone(state.schedules[state.activeId] ?? []); },
  readEditHistory: async () => { guard("readEditHistory"); return null; },
  writeEditHistory: async () => {},
  forgetEditHistory: async () => {},
  clearAllData: async () => {
    guard("clearAllData");
    state.courses[state.activeId] = [];
    state.schedules[state.activeId] = [];
  },
  addCourseTable: async name => {
    guard("addCourseTable");
    const id = state.nextId++;
    state.tables.push({ id, name });
    state.courses[id] = [];
    state.schedules[id] = [];
    return id;
  },
  deleteCourseTable: async () => { guard("deleteCourseTable"); },
  addCourse: async course => {
    guard("addCourse");
    const id = state.nextId++;
    state.courses[state.activeId].push({ id, ...clone(course) });
    return id;
  },
  addSchedule: async schedule => {
    guard("addSchedule");
    const id = state.nextId++;
    state.schedules[state.activeId].push({ id, ...clone(schedule) });
    return id;
  },
  replaceActiveTableContents: async () => { guard("replaceActiveTableContents"); },
  takeRecoveredTableNames: () => []
};
globalThis.__storageGuardService = service;
const methods = Object.keys(service);

const result = await build({
  entryPoints: [join(root, "src/composables/useCourses.ts")],
  absWorkingDir: root,
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  define: { "process.env.NODE_ENV": '"test"' },
  write: false,
  logLevel: "silent",
  plugins: [{
    name: "in-memory-course-service",
    setup(b) {
      b.onResolve({ filter: /^@\/services\/courseService$/ }, () => ({ path: "service", namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        contents: methods.map(method => `export const ${method} = (...args) => globalThis.__storageGuardService.${method}(...args);`).join("\n"),
        loader: "js"
      }));
    }
  }]
});
const dir = mkdtempSync(join(tmpdir(), "storage-guard-"));
const file = join(dir, "composable.mjs");
writeFileSync(file, result.outputFiles[0].text, "utf8");
const { useCourses } = await import(pathToFileURL(file).href);
const api = useCourses();
await api.coursesReady;

const backup = JSON.stringify({
  courses: [{ id: 1, name: "机器学习", color: "#000" }],
  schedules: [{ id: 1, courseId: 1, dayOfWeek: 5, startPeriod: 3, endPeriod: 4, startWeek: 9, endWeek: 16, weekType: "all", scope: "semester" }]
});

console.log("=== 1. 读库失败时设置照常读到 ===");
check("读库失败被记下来", Boolean(api.storageError.value), api.storageError.value);
check("学期开始日期是用户设的，不是默认值", api.semesterStartDate.value === "2026-09-07", api.semesterStartDate.value);
check("内存里的当前课表是不可信的默认 1 号", api.activeCourseTableId.value === 1 && api.courses.value.length === 0);

console.log("");
console.log("=== 2. 库仍打不开：改写课表的操作一律不做 ===");
{
  state.calls = [];
  const overwrite = await api.importFromJsonBackup(backup);
  check("覆盖导入直接失败", !overwrite.success && overwrite.message.includes("无法打开"), overwrite);
  const asNew = await api.importAsNewCourseTable("教务同步 11-27", () => api.importFromJsonBackup(backup));
  check("导入为新课表直接失败", !asNew.success && asNew.message.includes("无法打开"), asNew);
  const csv = await api.importFromSemesterCsv("星期,开始节,结束节,课程名称,上课地点,开始周,结束周,单双周\n周一,1,2,高数,A101,1,16,全部");
  check("AI 按学期导入直接失败", !csv.success, csv);
  let clearError = null;
  try {
    await api.clearAll();
  } catch (error) {
    clearError = error;
  }
  check("清空直接失败", clearError instanceof Error, String(clearError));
  check("没有发出任何删除或写入", !state.calls.some(name => ["clearAllData", "addCourseTable", "addCourse", "addSchedule", "deleteCourseTable", "setActiveCourseTableId"].includes(name)), state.calls);
  check("真正的当前课表里的课还在", state.courses[5].length === 1);
  check("记住的当前课表仍是 5 号", state.activeId === 5);
}

console.log("");
console.log("=== 3. 库恢复后：先重读，再改写 ===");
{
  state.broken = false;
  check("ensureStorageReady 读通了", (await api.ensureStorageReady()) === true);
  check("当前课表回到 5 号", api.activeCourseTableId.value === 5, api.activeCourseTableId.value);
  check("课程读回来了", api.courses.value.length === 1 && api.courses.value[0].name === "数据库原理", api.courses.value);
  check("读库错误清掉了", api.storageError.value === null, api.storageError.value);
}

console.log("");
console.log("=== 4. 导入为新课表返回新课表编号 ===");
{
  const asNew = await api.importAsNewCourseTable("教务同步 11-27", () => api.importFromJsonBackup(backup));
  check("导入成功", asNew.success, asNew);
  check("返回的编号就是新建的那张、也是现在的当前课表", typeof asNew.tableId === "number" && asNew.tableId === api.activeCourseTableId.value && asNew.tableId !== 5, [asNew.tableId, api.activeCourseTableId.value]);
  check("原来那张课表没被动过", state.courses[5].length === 1 && state.courses[5][0].name === "数据库原理");
}

console.log("");
console.log(failed === 0 ? "  ALL CHECKS PASSED" : "  " + failed + " CHECK(S) FAILED");
process.exit(failed ? 1 : 0);
