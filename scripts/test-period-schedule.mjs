// 节次时间表的纯逻辑：默认作息（第二套）、长按调整后的平移、节数增减、旧配置迁移。不打开界面。
//
// 用法: node scripts/test-period-schedule.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "./load-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ps = await loadTs(join(here, "..", "src", "utils", "periodSchedule.ts"));

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (!ok && detail !== undefined ? "   <- " + JSON.stringify(detail) : ""));
  if (!ok) failures++;
};

const m = (text) => ps.parseClock(text);
const clocks = (config) => config.periods.map((p) => `${ps.formatMinutes(p.start)}-${ps.formatMinutes(p.end)}`);
const defaults = () => ps.createDefaultPeriodConfig();

console.log("=== 默认作息：第二套（2026-10-01 起）===");
{
  const cfg = defaults();
  // 依据课表图片逐行核对：第二套那一列；第一套 14:30 / 15:20 / 16:25 / 17:20 / 18:10 / 19:30 ... 不是目标。
  const official = [
    "08:00-08:45", "08:55-09:40", "10:00-10:45", "10:55-11:40",
    "14:00-14:45", "14:50-15:35", "15:55-16:40", "16:50-17:35", "17:40-18:25",
    "19:00-19:45", "19:50-20:35", "20:40-21:25"
  ];
  check("12 节，逐节等于第二套", JSON.stringify(clocks(cfg)) === JSON.stringify(official), clocks(cfg));
  check("上午 4、下午 5、晚上 3", cfg.morningPeriods === 4 && cfg.afternoonPeriods === 5 && cfg.eveningPeriods === 3);
  check("默认配置合法", ps.isValidPeriodConfig(cfg));
  check("课间操 09:40–10:00 不是一行", cfg.periods.length === 12 && !clocks(cfg).includes("09:40-10:00"));
  check("没有第一套的 14:30 / 19:30", !clocks(cfg).some((c) => c.startsWith("14:30") || c.startsWith("19:30")));
  check("每次创建都是新对象", defaults() !== defaults() && defaults().periods !== defaults().periods);
  check("第 9 节紧跟第 8 节只隔 5 分钟", cfg.periods[8].start - cfg.periods[7].end === 5);
  check("时段划分", ps.sectionOfPeriod(cfg, 4).section === "morning" && ps.sectionOfPeriod(cfg, 5).section === "afternoon" && ps.sectionOfPeriod(cfg, 9).section === "afternoon" && ps.sectionOfPeriod(cfg, 10).section === "evening");
  check("越界节次没有时段", ps.sectionOfPeriod(cfg, 0) === null && ps.sectionOfPeriod(cfg, 13) === null && ps.periodRange(cfg, 13) === null);
  check("起始分钟（提醒用）", ps.periodRange(cfg, 5).start === 14 * 60 && ps.periodRange(cfg, 12).start === 20 * 60 + 40);
}

console.log("");
console.log("=== 平移：改开始 = 整节平移 ===");
{
  const cfg = defaults();
  const r = ps.shiftPeriods(cfg, 3, { field: "start", value: m("10:05") });
  check("第 3 节整体后移 5 分钟、长短不变", clocks(r.config)[2] === "10:05-10:50", clocks(r.config)[2]);
  check("同时段的第 4 节跟着后移 5 分钟", clocks(r.config)[3] === "11:00-11:45", clocks(r.config)[3]);
  check("第 1、2 节不动", clocks(r.config)[0] === "08:00-08:45" && clocks(r.config)[1] === "08:55-09:40");
  check("下午和晚上整段不动", clocks(r.config).slice(4).join() === clocks(cfg).slice(4).join());
  check("平移量记在 delta 里", r.delta === 5 && r.clamp === null);
  check("原配置没被改", clocks(cfg)[2] === "10:00-10:45");

  const earlier = ps.shiftPeriods(cfg, 7, { field: "start", value: m("15:50") });
  check("提前 5 分钟：第 7、8、9 节都提前，第 5、6 节不动", clocks(earlier.config).slice(4, 9).join() === "14:00-14:45,14:50-15:35,15:50-16:35,16:45-17:30,17:35-18:20", clocks(earlier.config).slice(4, 9));
  check("提前后晚上不动，晚饭变长", clocks(earlier.config).slice(9).join() === clocks(cfg).slice(9).join());

  const sectionStart = ps.shiftPeriods(cfg, 5, { field: "start", value: m("14:10") });
  check("改下午第 1 节的开始 = 整个下午晚 10 分钟", clocks(sectionStart.config).slice(4, 9).join() === "14:10-14:55,15:00-15:45,16:05-16:50,17:00-17:45,17:50-18:35", clocks(sectionStart.config).slice(4, 9));
  check("上午、晚上都不动", clocks(sectionStart.config).slice(0, 4).join() === clocks(cfg).slice(0, 4).join() && clocks(sectionStart.config).slice(9).join() === clocks(cfg).slice(9).join());
}

console.log("");
console.log("=== 平移：改结束 = 只改这一节的长短 ===");
{
  const cfg = defaults();
  const r = ps.shiftPeriods(cfg, 1, { field: "end", value: m("08:50") });
  check("第 1 节开始不变、结束 +5", clocks(r.config)[0] === "08:00-08:50", clocks(r.config)[0]);
  check("第 2、3、4 节同时段后移 5 分钟", clocks(r.config).slice(1, 4).join() === "09:00-09:45,10:05-10:50,11:00-11:45", clocks(r.config).slice(1, 4));
  check("课间（第 1→2 节）原样保留 10 分钟、课间操空档也保留", r.config.periods[1].start - r.config.periods[0].end === 10 && r.config.periods[2].start - r.config.periods[1].end === 20);
  check("午休吸收：下午仍 14:00", clocks(r.config)[4] === "14:00-14:45");

  const shorter = ps.shiftPeriods(cfg, 2, { field: "end", value: m("09:35") });
  check("缩短第 2 节：后面提前 5 分钟", clocks(shorter.config).slice(1, 4).join() === "08:55-09:35,09:55-10:40,10:50-11:35", clocks(shorter.config).slice(1, 4));

  const lastInSection = ps.shiftPeriods(cfg, 4, { field: "end", value: m("11:50") });
  check("时段最后一节拖堂：后面没有同段节次，别的段不动", clocks(lastInSection.config)[3] === "10:55-11:50" && clocks(lastInSection.config).slice(4).join() === clocks(cfg).slice(4).join());

  const lastNight = ps.shiftPeriods(cfg, 12, { field: "end", value: m("21:30") });
  check("最后一节也能改", clocks(lastNight.config)[11] === "20:40-21:30");
}

console.log("");
console.log("=== 边界与夹紧 ===");
{
  const cfg = defaults();
  const early = ps.shiftPeriods(cfg, 2, { field: "start", value: m("08:30") });
  check("开始不能早于上一节结束", early.config.periods[1].start === m("08:45") && early.clamp?.reason === "before-prev" && early.clamp.limit === m("08:45"), early);
  check("夹紧后整节仍保持原长度", early.config.periods[1].end - early.config.periods[1].start === 45);

  const earlyAfternoon = ps.shiftPeriods(cfg, 5, { field: "start", value: m("11:00") });
  check("下午第 1 节开始不能早于上午最后一节结束", earlyAfternoon.config.periods[4].start === m("11:40") && earlyAfternoon.clamp?.reason === "before-prev");

  const overrun = ps.shiftPeriods(cfg, 9, { field: "end", value: m("19:30") });
  check("下午最后一节拖堂不能撞上晚上第 1 节", overrun.config.periods[8].end === m("19:00") && overrun.clamp?.reason === "overrun-next" && overrun.clamp.limit === m("19:00"), overrun);
  check("夹紧后晚上没被挤动", overrun.config.periods[9].start === m("19:00"));
  const longMorning = ps.shiftPeriods(cfg, 4, { field: "end", value: m("14:30") });
  check("上午第 4 节拖到下午：先被「最长 180 分钟」拦住", longMorning.clamp?.reason === "too-long" && longMorning.config.periods[3].end === m("10:55") + 180, longMorning);

  const pushMorning = ps.shiftPeriods(cfg, 3, { field: "start", value: m("13:00") });
  check("整节平移到会让同段最后一节撞下午：停在刚好贴着", pushMorning.config.periods[3].end === m("14:00") && pushMorning.clamp?.reason === "overrun-next", pushMorning);

  const afternoonIntoEvening = ps.shiftPeriods(cfg, 5, { field: "start", value: m("16:00") });
  check("下午整体后移到会撞晚上：停在第 9 节贴着 19:00", afternoonIntoEvening.config.periods[8].end === m("19:00") && afternoonIntoEvening.clamp?.reason === "overrun-next");

  const tooShort = ps.shiftPeriods(cfg, 1, { field: "end", value: m("08:02") });
  check("一节至少 10 分钟", tooShort.config.periods[0].end === m("08:10") && tooShort.clamp?.reason === "too-short");

  const tooLong = ps.shiftPeriods(cfg, 12, { field: "end", value: m("23:55") });
  check("一节最多 180 分钟", tooLong.config.periods[11].end === m("20:40") + 180 && tooLong.clamp?.reason === "too-long", tooLong);

  const dayEnd = ps.shiftPeriods(ps.shiftPeriods(cfg, 12, { field: "end", value: m("23:00") }).config, 12, { field: "start", value: m("23:50") });
  check("不能超过 24:00", dayEnd.config.periods[11].end === 24 * 60 && dayEnd.clamp?.reason === "day-end", dayEnd);
  check("跨天的提示说超过 24:00", ps.clampMessage(cfg, 12, dayEnd.clamp).includes("24:00"));

  const same = ps.shiftPeriods(cfg, 2, { field: "start", value: m("08:55") });
  check("没改就原样返回", same.config === cfg && same.delta === 0 && same.clamp === null);

  const bad = ps.shiftPeriods(cfg, 99, { field: "start", value: 100 });
  check("不存在的节次不改任何东西", bad.config === cfg);
  check("夹紧提示给得出话", ps.clampMessage(cfg, 9, overrun.clamp).includes("19:00") && ps.clampMessage(cfg, 9, overrun.clamp).includes("晚上第 10 节"));
}

console.log("");
console.log("=== 「后面会怎样」的说明 ===");
{
  const cfg = defaults();
  const a = ps.shiftPeriods(cfg, 1, { field: "end", value: m("08:50") }).config;
  const lines = ps.shiftSummaryLines(ps.summarizeShift(cfg, a, 1));
  check("拖长第 1 节：后面三节推迟 5 分钟、午休缩短、下午仍 14:00", JSON.stringify(lines) === JSON.stringify(["第 2–4 节跟着推迟 5 分钟", "午休缩短 5 分钟，下午仍从 14:00 开始"]), lines);

  const b = ps.shiftPeriods(cfg, 3, { field: "start", value: m("10:05") }).config;
  const lines2 = ps.shiftSummaryLines(ps.summarizeShift(cfg, b, 3));
  check("第 3 节开始推迟：课间操空档变长、第 4 节跟着", lines2[0] === "课间从 20 分钟变为 25 分钟" && lines2[1] === "第 4 节跟着推迟 5 分钟", lines2);

  const c = ps.shiftPeriods(cfg, 5, { field: "start", value: m("14:10") }).config;
  const lines3 = ps.shiftSummaryLines(ps.summarizeShift(cfg, c, 5));
  check("改下午第 1 节：午休变长、下午其余节次跟着、晚饭缩短", lines3[0] === "午休从 140 分钟变为 150 分钟" && lines3[1] === "第 6–9 节跟着推迟 10 分钟" && lines3[2].startsWith("晚饭缩短 10 分钟"), lines3);

  check("没改动就没有说明", ps.shiftSummaryLines(ps.summarizeShift(cfg, cfg, 3)).length === 0);

  const d = ps.shiftPeriods(cfg, 12, { field: "end", value: m("21:30") }).config;
  check("最后一节只拖长：没有后续说明", ps.shiftSummaryLines(ps.summarizeShift(cfg, d, 12)).length === 0);

  // 先改开始再改结束，对比的是打开时的原样，不是上一步。
  const step1 = ps.shiftPeriods(cfg, 2, { field: "start", value: m("09:00") }).config;
  const step2 = ps.shiftPeriods(step1, 2, { field: "end", value: m("09:40") }).config;
  const lines4 = ps.shiftSummaryLines(ps.summarizeShift(cfg, step2, 2));
  check("先后移开始、再把结束拉回：这一节变短，后面回到原位，只剩课间变长", step2.periods[1].start === m("09:00") && step2.periods[1].end === m("09:40") && step2.periods[2].start === m("10:00") && JSON.stringify(lines4) === JSON.stringify(["课间从 10 分钟变为 15 分钟"]), { step2: clocks(step2), lines4 });
}

console.log("");
console.log("=== 随机编辑不会破坏规则 ===");
{
  let seed = 20261001;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  let broke = null;
  let cfg = defaults();
  for (let i = 0; i < 4000 && !broke; i++) {
    const period = 1 + Math.floor(rand() * 12);
    const field = rand() < 0.5 ? "start" : "end";
    const before = cfg;
    const value = Math.floor(rand() * 1500) - 30;
    const r = ps.shiftPeriods(before, period, { field, value });
    const span = ps.sectionOfPeriod(before, period);
    if (!ps.isValidPeriodConfig(r.config)) broke = { why: "invalid", period, field, value };
    // 之前的节次和后面的时段，一分钟都不能动。
    for (let j = 0; j < before.periods.length && !broke; j++) {
      const inRange = j >= period - 1 && j < span.to;
      const same = before.periods[j].start === r.config.periods[j].start && before.periods[j].end === r.config.periods[j].end;
      if (!inRange && !same) broke = { why: "moved outside", j, period, field, value };
    }
    // 同时段后面的节次：长短和彼此间隔不变。
    for (let j = period; j < span.to && !broke; j++) {
      const len = (c) => c.periods[j].end - c.periods[j].start;
      const gap = (c) => c.periods[j].start - c.periods[j - 1].end;
      if (j > period && (len(before) !== len(r.config) || gap(before) !== gap(r.config))) broke = { why: "rigid", j, period, field, value };
      if (j === period && len(before) !== len(r.config)) broke = { why: "length", j, period, field, value };
    }
    cfg = r.config;
    if (rand() < 0.02) cfg = defaults();
  }
  check("4000 次随机改动：始终合法、只动本时段、后续整体平移", broke === null, broke);
}

console.log("");
console.log("=== 增减节数 ===");
{
  const cfg = defaults();
  const same = ps.resizeSection(cfg, "afternoon", 5);
  check("节数没变就原样返回", same === cfg);

  const fewer = ps.resizeSection(cfg, "afternoon", 4);
  check("下午减到 4 节：去掉最后一节，晚上不动", fewer.afternoonPeriods === 4 && fewer.periods.length === 11 && clocks(fewer).slice(4, 8).join() === clocks(cfg).slice(4, 8).join() && clocks(fewer)[8] === "19:00-19:45", clocks(fewer));

  const more = ps.resizeSection(cfg, "morning", 5);
  check("上午加到 5 节：接在第 4 节后、沿用前面的课间（10 分钟）和长度，下午不动", clocks(more)[4] === "11:50-12:35" && clocks(more)[5] === "14:00-14:45" && more.morningPeriods === 5, clocks(more));
  check("加完仍合法", ps.isValidPeriodConfig(more));

  const eveningMore = ps.resizeSection(cfg, "evening", 4);
  check("晚上加到 4 节", clocks(eveningMore)[12] === "21:30-22:15", clocks(eveningMore));

  const tooMany = ps.resizeSection(ps.resizeSection(cfg, "evening", 6), "evening", 12);
  check("排出 24:00 之后就拒绝", tooMany === null);

  const pushes = ps.resizeSection(cfg, "afternoon", 8);
  check("下午加到 8 节：挤到晚上，晚上整体往后推而不重叠", pushes !== null && ps.isValidPeriodConfig(pushes) && pushes.periods[12].start >= pushes.periods[11].end, pushes && clocks(pushes));

  const eveningZero = ps.resizeSection(cfg, "evening", 0);
  const backToThree = ps.resizeSection(eveningZero, "evening", 3);
  check("晚上清零再加回来：从 19:00 起", eveningZero.periods.length === 9 && clocks(backToThree)[9] === "19:00-19:45", clocks(backToThree));
}

console.log("");
console.log("=== 本地存储：迁移 ===");
{
  const legacyDefault = { morningStart: "08:00", afternoonStart: "14:00", eveningStart: "19:00", periodDuration: 45, breakDuration: 10, longBreakDuration: 20, morningPeriods: 4, afternoonPeriods: 4, eveningPeriods: 2 };
  const none = ps.parseStoredPeriodConfig(null);
  check("没存过：默认", none.outcome === "default" && ps.periodConfigsEqual(none.config, defaults()));

  const upgraded = ps.parseStoredPeriodConfig(JSON.stringify(legacyDefault));
  check("旧默认值（没人改过）：升级到第二套", upgraded.outcome === "upgraded-default" && ps.periodConfigsEqual(upgraded.config, defaults()));

  const noEvening = { ...legacyDefault };
  delete noEvening.eveningStart;
  delete noEvening.eveningPeriods;
  const olderShape = ps.parseStoredPeriodConfig(JSON.stringify(noEvening));
  check("更老的、没有晚课字段的配置：按 0 节晚课 + 旧默认判断，不是旧默认，保留 8 节", olderShape.outcome === "migrated-custom" && olderShape.config.periods.length === 8);

  // 用旧代码的公式独立算一遍，确认迁移后每一节的钟点一分不差。
  const legacyStart = (cfg, period) => {
    const [mh, mm] = cfg.morningStart.split(":").map(Number);
    const [ah, am] = cfg.afternoonStart.split(":").map(Number);
    const [eh, em] = cfg.eveningStart.split(":").map(Number);
    let section;
    let local;
    if (period <= cfg.morningPeriods) { section = mh * 60 + mm; local = period; }
    else if (period <= cfg.morningPeriods + cfg.afternoonPeriods) { section = ah * 60 + am; local = period - cfg.morningPeriods; }
    else { section = eh * 60 + em; local = period - cfg.morningPeriods - cfg.afternoonPeriods; }
    return section + Math.floor((local - 1) / 2) * (cfg.periodDuration * 2 + cfg.breakDuration + cfg.longBreakDuration) + ((local - 1) % 2 === 1 ? cfg.periodDuration + cfg.breakDuration : 0);
  };
  const custom = { morningStart: "08:10", afternoonStart: "14:20", eveningStart: "18:45", periodDuration: 40, breakDuration: 5, longBreakDuration: 25, morningPeriods: 5, afternoonPeriods: 4, eveningPeriods: 3 };
  const migrated = ps.parseStoredPeriodConfig(JSON.stringify(custom));
  const expected = Array.from({ length: 12 }, (_, i) => legacyStart(custom, i + 1));
  check("用户改过：逐节保留旧公式算出的钟点", migrated.outcome === "migrated-custom" && migrated.config.periods.map((p) => p.start).join() === expected.join(), { got: migrated.config.periods.map((p) => p.start), expected });
  check("迁移后每节长度就是原来的每节时长，节数不变", migrated.config.periods.every((p) => p.end - p.start === 40) && migrated.config.morningPeriods === 5 && migrated.config.afternoonPeriods === 4 && migrated.config.eveningPeriods === 3);
  check("迁移结果合法", ps.isValidPeriodConfig(migrated.config));

  const onlyOneChanged = ps.parseStoredPeriodConfig(JSON.stringify({ ...legacyDefault, morningStart: "08:05" }));
  check("只改过一个值也算改过，不被默认覆盖", onlyOneChanged.outcome === "migrated-custom" && onlyOneChanged.config.periods[0].start === m("08:05") && onlyOneChanged.config.periods.length === 10);

  const roundTrip = ps.parseStoredPeriodConfig(JSON.stringify(ps.shiftPeriods(defaults(), 3, { field: "start", value: m("10:07") }).config));
  check("新格式原样读回（含 10:07 这种非整五分钟）", roundTrip.outcome === "stored" && roundTrip.config.periods[2].start === m("10:07") && roundTrip.config.periods[3].start === m("11:02"));

  check("损坏的 JSON：回默认", ps.parseStoredPeriodConfig("{oops").outcome === "invalid" && ps.parseStoredPeriodConfig("[]").outcome === "invalid" && ps.parseStoredPeriodConfig("null").outcome === "invalid");
  check("新格式但节数对不上：回默认", ps.parseStoredPeriodConfig(JSON.stringify({ morningPeriods: 4, afternoonPeriods: 5, eveningPeriods: 3, periods: [{ start: 480, end: 525 }] })).outcome === "invalid");
  check("新格式但相互重叠：回默认", ps.parseStoredPeriodConfig(JSON.stringify({ morningPeriods: 1, afternoonPeriods: 1, eveningPeriods: 0, periods: [{ start: 480, end: 540 }, { start: 500, end: 560 }] })).outcome === "invalid");
  check("旧格式但字段残缺：回默认", ps.parseStoredPeriodConfig(JSON.stringify({ morningStart: "08:00", periodDuration: 45 })).outcome === "invalid");
  check("旧格式但时间写坏：回默认", ps.parseStoredPeriodConfig(JSON.stringify({ ...legacyDefault, morningStart: "8点", periodDuration: 50 })).outcome === "invalid");

  const overlapping = ps.parseStoredPeriodConfig(JSON.stringify({ ...legacyDefault, morningStart: "08:00", afternoonStart: "09:00", periodDuration: 45 }));
  check("旧配置里下午早于上午结束：往后推到不重叠，仍保留", overlapping.outcome === "migrated-custom" && ps.isValidPeriodConfig(overlapping.config));
}

console.log("");
console.log("=== 设置页粗调：每节时长、时段开始，不能超过 24:00 ===");
{
  const cfg = defaults();
  const longer = ps.applyLessonMinutes(cfg, 50);
  check(
    "每节时长 50：课间不变，下午晚上的开始不动",
    longer.ok && clocks(longer.config).join() === [
      "08:00-08:50", "09:00-09:50", "10:10-11:00", "11:10-12:00",
      "14:00-14:50", "14:55-15:45", "16:05-16:55", "17:05-17:55", "18:00-18:50",
      "19:00-19:50", "19:55-20:45", "20:50-21:40"
    ].join(),
    longer.ok ? clocks(longer.config) : longer
  );
  check("拉长到会吃掉午休：整次拒绝", ps.applyLessonMinutes(cfg, 120).ok === false && ps.applyLessonMinutes(cfg, 120).reason === "overlap");
  check("时长不合法：拒绝", ps.applyLessonMinutes(cfg, 9).reason === "bad" && ps.applyLessonMinutes(cfg, 181).reason === "bad");

  const morning = ps.applySectionStart(cfg, "morning", m("08:30"));
  check(
    "上午开始推后：上午整体平移，下午不动",
    morning.ok && clocks(morning.config).slice(0, 5).join() === ["08:30-09:15", "09:25-10:10", "10:30-11:15", "11:25-12:10", "14:00-14:45"].join(),
    morning.ok ? clocks(morning.config) : morning
  );
  const tooEarly = ps.applySectionStart(cfg, "afternoon", m("11:00"));
  check("下午开始早于上午结束：拒绝，原表不动", tooEarly.ok === false && tooEarly.reason === "before-prev" && ps.periodConfigsEqual(cfg, defaults()));
  const tooLate = ps.applySectionStart(cfg, "evening", m("22:00"));
  check("晚课开始排过 24:00：拒绝", tooLate.ok === false && tooLate.reason === "past-day");

  const lateEvening = ps.applySectionStart(cfg, "evening", m("21:35"));
  check("晚课开始到 21:35：最后一节正好 24:00", lateEvening.ok && clocks(lateEvening.config)[11] === "23:15-24:00", lateEvening.ok ? clocks(lateEvening.config) : lateEvening);
  const pastDay = lateEvening.ok ? ps.applyLessonMinutes(lateEvening.config, 50) : { ok: false, reason: "bad" };
  check("这时再加每节时长：会超过 24:00，拒绝", pastDay.ok === false && pastDay.reason === "past-day");
  check("各节时长一致时能读出来", ps.lessonMinutesOf(cfg) === 45 && ps.lessonMinutesOf(longer.ok ? longer.config : cfg) === 50);
  const mixed = ps.shiftPeriods(cfg, 1, { field: "end", value: m("08:50") }).config;
  check("各节时长不一致时读不出来", ps.lessonMinutesOf(mixed) === null);
}

console.log("");
console.log("=== 接线（读源码）===");
{
  const courses = readFileSync(join(here, "..", "src/composables/useCourses.ts"), "utf8");
  check("getPeriodStartMinutes 直接读逐节时间", courses.includes("periodRange(periodConfig.value, period)?.start"));
  check("存储读取走迁移，不再裸 JSON.parse", courses.includes("parseStoredPeriodConfig(localStorage.getItem(STORAGE_KEYS.PERIOD_CONFIG))") && !courses.includes("JSON.parse(savedPeriodConfig)"));
  check("旧公式字段已经从 useCourses 里消失", !courses.includes("breakDuration") && !courses.includes("longBreakDuration") && !courses.includes("periodDuration"));
  const settings = readFileSync(join(here, "..", "src/views/settings/GridSettings.vue"), "utf8");
  check("大课间 / 小课间和逐节列表已删除", !settings.includes("breakDuration") && !settings.includes("longBreakDuration") && !settings.includes("periodDuration") && !settings.includes("小课间") && !settings.includes("大课间") && !settings.includes("openPeriodSheet") && !settings.includes("PeriodTimeSheet"));
  check("时间细节只留每节时长和三个开始时间", settings.includes("每节时长") && settings.includes("上午开始") && settings.includes("下午开始") && settings.includes("晚课开始"));
  check("恢复默认走新默认，不再写死旧值", settings.includes("resetPeriodConfig()") && !settings.includes('"14:00"'));
  check("设置里有长按用法，并写明超过 24:00 不会生效", settings.includes("单独改某一节，长按课表左侧的时间。同一时段里后面的节次会跟着平移。超过 24:00 的调整不会生效。"));
  const grid = readFileSync(join(here, "..", "src/components/timetable/WeekGrid.vue"), "utf8");
  check("时间列长按：独立计时，不碰课程拖动", grid.includes("startTimePress(slot.period, $event)") && grid.includes("request-edit-period") && grid.includes("TIME_PRESS_MS"));
  check("时间列长按：滚动、第二根手指、pointercancel 都会取消", grid.includes('window.addEventListener("pointercancel", clearTimePress)') && grid.includes("onTimePressOtherPointer") && grid.includes('"scroll", clearTimePress'));
  check("时间列仍约 44px、没有变成不透明", grid.includes("--time-col-width: 44px;") && !/\.time-col\.is-pressing[^}]*var\(--theme-bg-color\)/.test(grid));
  const home = readFileSync(join(here, "..", "src/views/HomeView.vue"), "utf8");
  check("主屏接了编辑面板", home.includes("PeriodTimeSheet") && home.includes("@request-edit-period"));
}

console.log("");
console.log(failures === 0 ? "  ALL CHECKS PASSED" : "  " + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
