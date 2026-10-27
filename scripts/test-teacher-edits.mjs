// Exercise the real composable; replace only persistence, not its edit decisions.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clone = value => JSON.parse(JSON.stringify(value));
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};

let dbCourses = [];
let dbSchedules = [];
let nextCourse = 10;
let nextSchedule = 10;
const service = {
  getCourseTables: async () => [{ id: 1, name: "Test" }],
  getActiveCourseTableId: async () => 1,
  getAllCourses: async () => clone(dbCourses),
  getAllSchedules: async () => clone(dbSchedules),
  readEditHistory: async () => null,
  writeEditHistory: async () => {},
  updateCourse: async course => {
    dbCourses = dbCourses.map(row => row.id === course.id ? clone(course) : row);
  },
  updateSchedule: async schedule => {
    dbSchedules = dbSchedules.map(row => row.id === schedule.id ? clone(schedule) : row);
  },
  addCourse: async course => {
    const id = nextCourse++;
    dbCourses.push({ id, ...clone(course) });
    return id;
  },
  addSchedule: async schedule => {
    const id = nextSchedule++;
    dbSchedules.push({ id, ...clone(schedule) });
    return id;
  }
};
globalThis.__teacherEditService = service;
const methods = [
  "addCourse", "addCourseTable", "addSchedule", "clearAllData",
  "clearWeeklySchedulesForWeek", "deleteCourse", "deleteCourseTable", "deleteSchedule",
  "forgetEditHistory", "getActiveCourseTableId", "getAllCourses", "getAllSchedules",
  "getCourseTables", "readEditHistory", "renameCourseTable", "replaceActiveTableContents",
  "setActiveCourseTableId", "updateCourse", "updateSchedule", "writeEditHistory"
];
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
    setup(build) {
      build.onResolve({ filter: /^@\/services\/courseService$/ }, () => ({ path: "service", namespace: "test" }));
      build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        contents: methods.map(method => `export const ${method} = (...args) => globalThis.__teacherEditService.${method}(...args);`).join("\n"),
        loader: "js"
      }));
    }
  }]
});
const dir = mkdtempSync(join(tmpdir(), "teacher-edits-"));
const file = join(dir, "composable.mjs");
writeFileSync(file, result.outputFiles[0].text, "utf8");
const { useCourses } = await import(pathToFileURL(file).href);
const api = useCourses();
await api.coursesReady;

const initialCourse = { id: 1, name: "Course", teacher: "Teacher A", location: "Room A", color: "#fff" };
const row = (id, teacher, location, extra = {}) => ({
  id, courseId: 1, dayOfWeek: id === 1 ? 1 : 3,
  startPeriod: 1, endPeriod: 2, startWeek: 1, endWeek: 16,
  weekType: "all", scope: "semester", isCancelled: false,
  teacher, location, ...extra
});
const reset = () => {
  dbCourses = [clone(initialCourse)];
  dbSchedules = [row(1, "Teacher B", "Room B"), row(2, "Teacher C", "Room C")];
  api.courses.value = clone(dbCourses);
  api.schedules.value = clone(dbSchedules);
  api.setCurrentWeek(2);
  nextCourse = 10;
  nextSchedule = 10;
};
const payload = extra => ({ name: "Course", teacher: "Teacher B", location: "Room B", span: 2, weekScope: "all", ...extra });
const snapshot = () => JSON.stringify({ courses: api.courses.value, schedules: api.schedules.value });
const effectiveTeacher = schedule => schedule.teacher || api.getCourseById(schedule.courseId)?.teacher;
const effectiveLocation = schedule => schedule.location || api.getCourseById(schedule.courseId)?.location;
const test = async (name, run) => {
  reset();
  await run();
  assert.deepEqual(clone(api.courses.value), dbCourses, "course persistence must match the screen");
  assert.deepEqual(clone(api.schedules.value), dbSchedules, "schedule persistence must match the screen");
  console.log("  PASS  " + name);
};

await test("unchanged semester save preserves all imported teachers and rooms", async () => {
  const before = snapshot();
  assert.equal(await api.updateOccurrenceInScope(1, payload({})), false);
  assert.equal(snapshot(), before);
});

await test("renaming for the semester preserves per-occurrence fields and defaults", async () => {
  assert.equal(await api.updateOccurrenceInScope(1, payload({ name: "Renamed" })), true);
  assert.equal(api.getCourseById(1).teacher, "Teacher A");
  assert.equal(api.getCourseById(1).location, "Room A");
  assert.deepEqual(api.schedules.value.map(effectiveTeacher), ["Teacher B", "Teacher C"]);
  assert.deepEqual(api.schedules.value.map(effectiveLocation), ["Room B", "Room C"]);
});

await test("changing only the semester room preserves every teacher", async () => {
  await api.updateOccurrenceInScope(1, payload({ location: "New room" }));
  assert.equal(api.getCourseById(1).teacher, "Teacher A");
  assert.deepEqual(api.schedules.value.map(effectiveTeacher), ["Teacher B", "Teacher C"]);
  assert.deepEqual(api.schedules.value.map(effectiveLocation), ["New room", "New room"]);
});

await test("an actual semester teacher edit updates every occurrence and preserves rooms", async () => {
  await api.updateOccurrenceInScope(1, payload({ teacher: "New teacher" }));
  assert.deepEqual(api.schedules.value.map(effectiveTeacher), ["New teacher", "New teacher"]);
  assert.deepEqual(api.schedules.value.map(effectiveLocation), ["Room B", "Room C"]);
});

await test("changing only this week's duration carries its imported teacher and room", async () => {
  await api.updateOccurrenceInScope(1, payload({ weekScope: "current", span: 3 }));
  const visible = api.getSchedulesForWeek(2).find(schedule => schedule.dayOfWeek === 1);
  assert.equal(visible.endPeriod, 3);
  assert.equal(effectiveTeacher(visible), "Teacher B");
  assert.equal(effectiveLocation(visible), "Room B");
  assert.equal(effectiveTeacher(api.getSchedulesForWeek(3).find(schedule => schedule.dayOfWeek === 1)), "Teacher B");
  assert.equal(api.getCourseById(1).teacher, "Teacher A");
});

await test("changing only this week's room preserves its teacher and leaves other weeks intact", async () => {
  await api.updateOccurrenceInScope(1, payload({ weekScope: "current", location: "Weekly room" }));
  const visible = api.getSchedulesForWeek(2).find(schedule => schedule.dayOfWeek === 1);
  assert.equal(effectiveTeacher(visible), "Teacher B");
  assert.equal(effectiveLocation(visible), "Weekly room");
  const later = api.getSchedulesForWeek(3).find(schedule => schedule.dayOfWeek === 1);
  assert.equal(effectiveTeacher(later), "Teacher B");
  assert.equal(effectiveLocation(later), "Room B");
});

console.log("\nALL CHECKS PASSED");
