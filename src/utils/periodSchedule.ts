// 节次时间表的纯逻辑：默认作息、长按调整后的「平移」、节数增减、旧配置迁移。
// 不依赖 Vue，scripts/test-period-schedule.mjs 直接跑它。
//
// 时间一律用「当天第几分钟」（08:45 = 525）。每一节只存起止，课间是相邻两节之间的空档，不单独存。

import type { PeriodRange, PeriodTimeConfig } from "@/types/course";

export type PeriodSection = "morning" | "afternoon" | "evening";

export const SECTION_NAMES: Record<PeriodSection, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上"
};

/// 一节课最短 / 最长。底线只是防手滑，不是学校规定。
export const MIN_PERIOD_MINUTES = 10;
export const MAX_PERIOD_MINUTES = 180;
/// 一天的尽头。结束时间可以正好是 24:00，不能再晚；开始时间不能是 24:00。
export const DAY_END_MINUTE = 24 * 60;

export const parseClock = (text: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

export const formatMinutes = (minutes: number): string => {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};

/// 河南科技大学「第二套」作息，2026-10-01 起执行（5 月 1 日起执行的是第一套，不是这个）。
/// 第 2、3 节之间的 09:40–10:00 是课间操，只是空档，不占一行。
const OFFICIAL_SECOND_SCHEDULE: ReadonlyArray<readonly [string, string]> = [
  ["08:00", "08:45"],
  ["08:55", "09:40"],
  ["10:00", "10:45"],
  ["10:55", "11:40"],
  ["14:00", "14:45"],
  ["14:50", "15:35"],
  ["15:55", "16:40"],
  ["16:50", "17:35"],
  ["17:40", "18:25"],
  ["19:00", "19:45"],
  ["19:50", "20:35"],
  ["20:40", "21:25"]
];

const DEFAULT_SECTION_COUNTS = { morningPeriods: 4, afternoonPeriods: 5, eveningPeriods: 3 };

export const createDefaultPeriodConfig = (): PeriodTimeConfig => ({
  ...DEFAULT_SECTION_COUNTS,
  periods: OFFICIAL_SECOND_SCHEDULE.map(([start, end]) => ({
    start: parseClock(start) as number,
    end: parseClock(end) as number
  }))
});

export const totalPeriodCount = (config: PeriodTimeConfig): number =>
  config.morningPeriods + config.afternoonPeriods + config.eveningPeriods;

export interface SectionSpan {
  section: PeriodSection;
  /// 下标，含头不含尾：第 from+1 节到第 to 节。
  from: number;
  to: number;
}

export const sectionSpans = (config: PeriodTimeConfig): SectionSpan[] => {
  const morningEnd = config.morningPeriods;
  const afternoonEnd = morningEnd + config.afternoonPeriods;
  const eveningEnd = afternoonEnd + config.eveningPeriods;
  return [
    { section: "morning", from: 0, to: morningEnd },
    { section: "afternoon", from: morningEnd, to: afternoonEnd },
    { section: "evening", from: afternoonEnd, to: eveningEnd }
  ];
};

/// 第 period 节（从 1 数）所在的时段。越界返回 null。
export const sectionOfPeriod = (config: PeriodTimeConfig, period: number): SectionSpan | null => {
  const index = period - 1;
  if (!Number.isInteger(index) || index < 0) return null;
  return sectionSpans(config).find(span => index >= span.from && index < span.to) ?? null;
};

export const periodRange = (config: PeriodTimeConfig, period: number): PeriodRange | null => {
  if (!Number.isInteger(period) || period < 1 || period > config.periods.length) return null;
  return config.periods[period - 1];
};

export const formatPeriodRange = (range: PeriodRange): string =>
  `${formatMinutes(range.start)}-${formatMinutes(range.end)}`;

export const isValidPeriodConfig = (config: PeriodTimeConfig): boolean => {
  const counts = [config.morningPeriods, config.afternoonPeriods, config.eveningPeriods];
  if (!counts.every(count => Number.isInteger(count) && count >= 0)) return false;
  if (!Array.isArray(config.periods) || config.periods.length !== totalPeriodCount(config)) return false;
  let previousEnd = 0;
  for (const range of config.periods) {
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) return false;
    if (range.start < previousEnd || range.end <= range.start || range.end > DAY_END_MINUTE) return false;
    previousEnd = range.end;
  }
  return true;
};

const clonePeriods = (periods: PeriodRange[]): PeriodRange[] =>
  periods.map(range => ({ start: range.start, end: range.end }));

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// ---------------------------------------------------------------------------------------------
// 长按调整：平移规则
//
//   改「开始」：这一节整体平移（长短不变）。
//   改「结束」：只改这一节的长短。
//   两种情况下，同一时段（上午 / 下午 / 晚上）里排在后面的节次，都按这一节结束时间的变化量整体平移，
//   各自的长短和彼此的课间不变。
//   时段之间（午休、晚饭）不跟着动：它们是缓冲，会被缩短或拉长。所以下午第一节开始时间不会因为上午
//   拖堂而变，想改下午几点开始，就去改下午第一节的开始。
//
// 不会产生重叠：开始不能早于上一节结束；顺延到的最后一节不能越过下一个时段的开始，也不能超过 24:00。
// 越界时停在边界上，并告诉调用方停在哪、为什么。
// ---------------------------------------------------------------------------------------------

export type PeriodClampReason = "before-prev" | "overrun-next" | "day-end" | "too-short" | "too-long";

export interface PeriodClamp {
  reason: PeriodClampReason;
  /// 被改的那个值（开始或结束）最终停在哪一分钟。
  limit: number;
}

export type PeriodEdit = { field: "start" | "end"; value: number };

export interface ShiftResult {
  config: PeriodTimeConfig;
  /// 同一时段里后面的节次实际平移了多少分钟（正为推迟）。
  delta: number;
  clamp: PeriodClamp | null;
}

export const shiftPeriods = (config: PeriodTimeConfig, period: number, edit: PeriodEdit): ShiftResult => {
  const span = sectionOfPeriod(config, period);
  if (!span || !Number.isFinite(edit.value)) return { config, delta: 0, clamp: null };

  const index = period - 1;
  const last = span.to - 1;
  const current = config.periods[index];
  const previousEnd = index > 0 ? config.periods[index - 1].end : 0;
  const hasNextSection = span.to < config.periods.length;
  const ceiling = hasNextSection ? config.periods[span.to].start : DAY_END_MINUTE;
  // 这一节之后整段还能往后推多少。
  const room = ceiling - config.periods[last].end;
  const overrun: PeriodClampReason = hasNextSection ? "overrun-next" : "day-end";
  const wanted = Math.round(edit.value);

  let delta: number;
  let nextStart = current.start;
  let nextEnd = current.end;
  let clampInfo: PeriodClamp | null = null;

  if (edit.field === "start") {
    const lowest = previousEnd - current.start;
    delta = clamp(wanted - current.start, lowest, room);
    if (wanted - current.start < lowest) clampInfo = { reason: "before-prev", limit: previousEnd };
    else if (wanted - current.start > room) clampInfo = { reason: overrun, limit: current.start + room };
    nextStart = current.start + delta;
    nextEnd = current.end + delta;
  } else {
    const shortest = current.start + MIN_PERIOD_MINUTES;
    const byLength = current.start + MAX_PERIOD_MINUTES;
    const byRoom = current.end + room;
    // 空间优先于「最短」：宁可短一点也不能撞上后面。
    const upper = Math.min(byLength, byRoom);
    const settled = Math.min(Math.max(wanted, shortest), upper);
    if (wanted < shortest) clampInfo = { reason: "too-short", limit: settled };
    else if (wanted > upper) clampInfo = { reason: byRoom < byLength ? overrun : "too-long", limit: settled };
    delta = settled - current.end;
    nextEnd = settled;
  }

  if (delta === 0 && nextStart === current.start && nextEnd === current.end) {
    return { config, delta: 0, clamp: clampInfo };
  }

  const periods = clonePeriods(config.periods);
  periods[index] = { start: nextStart, end: nextEnd };
  for (let i = index + 1; i <= last; i++) {
    periods[i] = { start: periods[i].start + delta, end: periods[i].end + delta };
  }
  return { config: { ...config, periods }, delta, clamp: clampInfo };
};

export interface ShiftSummary {
  changed: boolean;
  /// 与前一节的间隔变化（第 1 节没有）。name 是「课间」「午休」「晚饭」。
  gapBefore: { name: string; from: number; to: number } | null;
  /// 同时段里被顺延的节次（从 1 数）和平移分钟数。
  moved: { periods: number[]; by: number } | null;
  /// 下一个时段的开始没动，缓冲被缩短 / 拉长了多少。
  absorbed: { name: string; sectionName: string; startsAt: number; by: number } | null;
}

const gapName = (config: PeriodTimeConfig, index: number): string => {
  const span = sectionOfPeriod(config, index + 1);
  if (!span || index !== span.from) return "课间";
  return span.section === "afternoon" ? "午休" : span.section === "evening" ? "晚饭" : "课间";
};

/// 对比改动前后的两份配置，说清楚这一节的改动牵动了什么。只用来给人看，不参与计算。
export const summarizeShift = (before: PeriodTimeConfig, after: PeriodTimeConfig, period: number): ShiftSummary => {
  const none: ShiftSummary = { changed: false, gapBefore: null, moved: null, absorbed: null };
  const span = sectionOfPeriod(before, period);
  const index = period - 1;
  if (!span || before.periods.length !== after.periods.length) return none;

  const a = before.periods[index];
  const b = after.periods[index];
  const changed = a.start !== b.start || a.end !== b.end;
  if (!changed) return none;

  let gapBefore: ShiftSummary["gapBefore"] = null;
  if (index > 0) {
    const from = a.start - before.periods[index - 1].end;
    const to = b.start - after.periods[index - 1].end;
    if (from !== to) gapBefore = { name: gapName(before, index), from, to };
  }

  const movedPeriods: number[] = [];
  let by = 0;
  for (let i = index + 1; i < span.to; i++) {
    const shift = after.periods[i].start - before.periods[i].start;
    if (shift !== 0) {
      movedPeriods.push(i + 1);
      by = shift;
    }
  }

  let absorbed: ShiftSummary["absorbed"] = null;
  if (span.to < before.periods.length) {
    const lastBefore = before.periods[span.to - 1];
    const lastAfter = after.periods[span.to - 1];
    const gapFrom = before.periods[span.to].start - lastBefore.end;
    const gapTo = after.periods[span.to].start - lastAfter.end;
    if (gapFrom !== gapTo) {
      const next = sectionOfPeriod(before, span.to + 1);
      absorbed = {
        name: gapName(before, span.to),
        sectionName: next ? SECTION_NAMES[next.section] : "",
        startsAt: after.periods[span.to].start,
        by: gapTo - gapFrom
      };
    }
  }

  return {
    changed,
    gapBefore,
    moved: movedPeriods.length > 0 ? { periods: movedPeriods, by } : null,
    absorbed
  };
};

const periodList = (periods: number[]): string =>
  periods.length === 1 ? `第 ${periods[0]} 节` : `第 ${periods[0]}–${periods[periods.length - 1]} 节`;

/// 编辑面板里「后面会怎样」那几行字。
export const shiftSummaryLines = (summary: ShiftSummary): string[] => {
  const lines: string[] = [];
  if (summary.gapBefore) {
    lines.push(`${summary.gapBefore.name}从 ${summary.gapBefore.from} 分钟变为 ${summary.gapBefore.to} 分钟`);
  }
  if (summary.moved) {
    const { periods, by } = summary.moved;
    lines.push(`${periodList(periods)}跟着${by > 0 ? "推迟" : "提前"} ${Math.abs(by)} 分钟`);
  }
  if (summary.absorbed) {
    const { name, sectionName, startsAt, by } = summary.absorbed;
    // by 是缓冲的变化量：正数是变长了。
    lines.push(`${name}${by < 0 ? "缩短" : "延长"} ${Math.abs(by)} 分钟，${sectionName}仍从 ${formatMinutes(startsAt)} 开始`);
  }
  return lines;
};

export const clampMessage = (config: PeriodTimeConfig, period: number, clampInfo: PeriodClamp): string => {
  const span = sectionOfPeriod(config, period);
  switch (clampInfo.reason) {
    case "before-prev":
      return `不能早于上一节的结束时间 ${formatMinutes(clampInfo.limit)}`;
    case "overrun-next": {
      const next = span ? sectionOfPeriod(config, span.to + 1) : null;
      const name = next ? `${SECTION_NAMES[next.section]}第 ${next.from + 1} 节` : "后面的节次";
      return `最晚到 ${formatMinutes(clampInfo.limit)}，再往后会和${name}重叠`;
    }
    case "day-end":
      return `再往后会超过 24:00，最晚到 ${formatMinutes(clampInfo.limit)}`;
    case "too-short":
      return `一节课至少 ${MIN_PERIOD_MINUTES} 分钟`;
    case "too-long":
      return `一节课最多 ${MAX_PERIOD_MINUTES} 分钟`;
  }
};

// ---------------------------------------------------------------------------------------------
// 设置页只留两个粗调：每个时段的开始时间，以及统一的每节时长。
// 细调仍走长按。放不下（超过 24:00，或会叠上下一个时段）时整次拒绝，不改一半。
// ---------------------------------------------------------------------------------------------

export type ScheduleReject = "past-day" | "overlap" | "before-prev" | "bad";

export type ScheduleEditResult =
  | { ok: true; config: PeriodTimeConfig }
  | { ok: false; reason: ScheduleReject };

/// 各节时长一致时返回那个分钟数，否则 null。
export const lessonMinutesOf = (config: PeriodTimeConfig): number | null => {
  if (config.periods.length === 0) return null;
  const length = config.periods[0].end - config.periods[0].start;
  return config.periods.every(range => range.end - range.start === length) ? length : null;
};

/// 把每一节都改成这个时长。各时段的第一节开始时间、时段内部的课间都保持不变。
/// 拉长后如果会撞上下一个时段，或最后一节超过 24:00，整次拒绝。
export const applyLessonMinutes = (config: PeriodTimeConfig, minutes: number): ScheduleEditResult => {
  if (!Number.isInteger(minutes) || minutes < MIN_PERIOD_MINUTES || minutes > MAX_PERIOD_MINUTES) {
    return { ok: false, reason: "bad" };
  }
  const periods = clonePeriods(config.periods);
  for (const span of sectionSpans(config)) {
    if (span.to <= span.from) continue;
    const gaps: number[] = [];
    for (let i = span.from; i < span.to - 1; i++) {
      gaps.push(periods[i + 1].start - periods[i].end);
    }
    let cursor = periods[span.from].start;
    for (let i = span.from; i < span.to; i++) {
      const end = cursor + minutes;
      if (cursor < 0 || end > DAY_END_MINUTE) return { ok: false, reason: "past-day" };
      periods[i] = { start: cursor, end };
      cursor = end + (gaps[i - span.from] ?? 0);
    }
    if (span.to < periods.length && periods[span.to - 1].end > periods[span.to].start) {
      return { ok: false, reason: "overlap" };
    }
  }
  const next = { ...config, periods };
  return isValidPeriodConfig(next) ? { ok: true, config: next } : { ok: false, reason: "bad" };
};

/// 某个时段第一节的开始时间。该时段没有课时返回 null。
export const sectionStartMinutes = (config: PeriodTimeConfig, section: PeriodSection): number | null => {
  const span = sectionSpans(config).find(item => item.section === section);
  if (!span || span.to <= span.from) return null;
  return config.periods[span.from].start;
};

/// 改某个时段的开始时间：这一时段整体平移，后面的时段不动。
/// 请求的钟点落不进去（会超过 24:00、叠到下一时段、或早于上一时段结束）时整次拒绝。
export const applySectionStart = (
  config: PeriodTimeConfig,
  section: PeriodSection,
  minutes: number
): ScheduleEditResult => {
  const span = sectionSpans(config).find(item => item.section === section);
  if (!span || span.to <= span.from || !Number.isFinite(minutes)) return { ok: false, reason: "bad" };
  const wanted = Math.round(minutes);
  if (wanted < 0 || wanted >= DAY_END_MINUTE) return { ok: false, reason: "past-day" };
  const result = shiftPeriods(config, span.from + 1, { field: "start", value: wanted });
  const actual = result.config.periods[span.from].start;
  if (actual !== wanted) {
    const reason: ScheduleReject = result.clamp?.reason === "day-end"
      ? "past-day"
      : result.clamp?.reason === "before-prev"
        ? "before-prev"
        : result.clamp?.reason === "overrun-next"
          ? "overlap"
          : "bad";
    return { ok: false, reason };
  }
  return isValidPeriodConfig(result.config) ? { ok: true, config: result.config } : { ok: false, reason: "bad" };
};

// ---------------------------------------------------------------------------------------------
// 增减某个时段的节数
// ---------------------------------------------------------------------------------------------

const SECTION_FALLBACK_START: Record<PeriodSection, number> = {
  morning: 8 * 60,
  afternoon: 14 * 60,
  evening: 19 * 60
};

const DEFAULT_PERIOD_MINUTES = 45;
const DEFAULT_GAP_MINUTES = 5;

/// 后面的节次若被挤到了，就整体往后推到刚好不重叠；推到超过 24:00 就返回 null。
const pushOverlaps = (periods: PeriodRange[], from: number): PeriodRange[] | null => {
  for (let i = Math.max(from, 1); i < periods.length; i++) {
    const overlap = periods[i - 1].end - periods[i].start;
    if (overlap > 0) periods[i] = { start: periods[i].start + overlap, end: periods[i].end + overlap };
  }
  const last = periods[periods.length - 1];
  return last && last.end > DAY_END_MINUTE ? null : periods;
};

/// 把某个时段改成 count 节。减少时去掉该时段最后几节；增加时接在该时段最后一节后面（长短和课间沿用
/// 前一节），挤到的后续节次整体往后推。放不下返回 null。
export const resizeSection = (config: PeriodTimeConfig, section: PeriodSection, count: number): PeriodTimeConfig | null => {
  const span = sectionSpans(config).find(item => item.section === section);
  if (!span || !Number.isInteger(count) || count < 0) return null;
  const current = span.to - span.from;
  if (count === current) return config;

  const periods = clonePeriods(config.periods);
  if (count < current) {
    periods.splice(span.from + count, current - count);
  } else {
    for (let added = 0; added < count - current; added++) {
      const insertAt = span.from + current + added;
      const previous = insertAt > 0 ? periods[insertAt - 1] : null;
      const sameSection = insertAt > span.from;
      let start: number;
      let length = DEFAULT_PERIOD_MINUTES;
      if (previous && sameSection) {
        const gap = insertAt - span.from >= 2
          ? Math.max(periods[insertAt - 1].start - periods[insertAt - 2].end, 0)
          : DEFAULT_GAP_MINUTES;
        start = previous.end + gap;
        length = previous.end - previous.start;
      } else {
        start = Math.max(SECTION_FALLBACK_START[section], previous ? previous.end + DEFAULT_GAP_MINUTES : 0);
      }
      periods.splice(insertAt, 0, { start, end: start + length });
    }
    if (!pushOverlaps(periods, span.from + current)) return null;
  }

  const counts = {
    morningPeriods: config.morningPeriods,
    afternoonPeriods: config.afternoonPeriods,
    eveningPeriods: config.eveningPeriods
  };
  if (section === "morning") counts.morningPeriods = count;
  else if (section === "afternoon") counts.afternoonPeriods = count;
  else counts.eveningPeriods = count;

  const next = { ...counts, periods };
  return isValidPeriodConfig(next) ? next : null;
};

// ---------------------------------------------------------------------------------------------
// 读取本地存储：新格式、旧格式（每节时长 + 课间公式）、缺失或损坏
// ---------------------------------------------------------------------------------------------

export type StoredPeriodOutcome =
  /// 没存过：用默认。
  | "default"
  /// 新格式，原样读回。
  | "stored"
  /// 旧格式，而且恰好是旧默认值（没人动过）：升级到第二套默认。
  | "upgraded-default"
  /// 旧格式，用户改过：按他原来的公式算出每一节的时间，逐节保留。
  | "migrated-custom"
  /// 存了，但读不出来（损坏、数值离谱）：回到默认。
  | "invalid";

const LEGACY_DEFAULT = {
  morningStart: "08:00",
  afternoonStart: "14:00",
  eveningStart: "19:00",
  periodDuration: 45,
  breakDuration: 10,
  longBreakDuration: 20,
  morningPeriods: 4,
  afternoonPeriods: 4,
  eveningPeriods: 2
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLegacyDefault = (raw: Record<string, unknown>): boolean =>
  (Object.keys(LEGACY_DEFAULT) as Array<keyof typeof LEGACY_DEFAULT>).every(key => {
    // 老版本的 eveningPeriods / eveningStart 可能缺失，代码里当 0 / 19:00 用。
    const value = raw[key] ?? (key === "eveningPeriods" ? 0 : key === "eveningStart" ? "19:00" : undefined);
    return value === LEGACY_DEFAULT[key];
  });

/// 旧公式：每个时段内两节一组，组内课间 breakDuration，组间 longBreakDuration，时段从各自的开始时间起。
/// 只用来把老用户改过的配置换算成逐节时间，保证升级后他看到的钟点一分不差。
const migrateLegacyConfig = (raw: Record<string, unknown>): PeriodTimeConfig | null => {
  const num = (value: unknown, fallback?: number): number | null => {
    const picked = value === undefined || value === null ? fallback : value;
    return typeof picked === "number" && Number.isFinite(picked) ? picked : null;
  };
  const duration = num(raw.periodDuration);
  const shortBreak = num(raw.breakDuration);
  const longBreak = num(raw.longBreakDuration);
  const morning = num(raw.morningPeriods);
  const afternoon = num(raw.afternoonPeriods);
  const evening = num(raw.eveningPeriods, 0);
  const morningStart = parseClock(String(raw.morningStart ?? ""));
  const afternoonStart = parseClock(String(raw.afternoonStart ?? ""));
  const eveningStart = parseClock(String(raw.eveningStart ?? "19:00"));
  if (
    duration === null || shortBreak === null || longBreak === null ||
    morning === null || afternoon === null || evening === null ||
    morningStart === null || afternoonStart === null || eveningStart === null
  ) return null;
  if (![morning, afternoon, evening].every(count => Number.isInteger(count) && count >= 0 && count <= 12)) return null;
  if (!Number.isInteger(duration) || duration < 1 || shortBreak < 0 || longBreak < 0) return null;

  const periods: PeriodRange[] = [];
  const addSection = (count: number, sectionStart: number) => {
    for (let local = 1; local <= count; local++) {
      const blocks = Math.floor((local - 1) / 2);
      const secondInBlock = (local - 1) % 2 === 1;
      const start = sectionStart +
        blocks * (duration * 2 + shortBreak + longBreak) +
        (secondInBlock ? duration + shortBreak : 0);
      periods.push({ start, end: start + duration });
    }
  };
  addSection(morning, morningStart);
  addSection(afternoon, afternoonStart);
  addSection(evening, eveningStart);

  // 老配置允许下午开始得比上午结束还早；这种自相矛盾的，往后推到不重叠，宁可保住顺序。
  if (periods.length > 0 && !pushOverlaps(periods, 1)) return null;
  const config = { morningPeriods: morning, afternoonPeriods: afternoon, eveningPeriods: evening, periods };
  return isValidPeriodConfig(config) ? config : null;
};

export const parseStoredPeriodConfig = (text: string | null): { config: PeriodTimeConfig; outcome: StoredPeriodOutcome } => {
  const fresh = createDefaultPeriodConfig();
  if (text === null || text === "") return { config: fresh, outcome: "default" };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { config: fresh, outcome: "invalid" };
  }
  if (!isRecord(raw)) return { config: fresh, outcome: "invalid" };

  if (Array.isArray(raw.periods)) {
    const candidate: PeriodTimeConfig = {
      morningPeriods: raw.morningPeriods as number,
      afternoonPeriods: raw.afternoonPeriods as number,
      eveningPeriods: raw.eveningPeriods as number,
      periods: (raw.periods as unknown[]).map(item => isRecord(item)
        ? { start: item.start as number, end: item.end as number }
        : { start: NaN, end: NaN })
    };
    return isValidPeriodConfig(candidate)
      ? { config: candidate, outcome: "stored" }
      : { config: fresh, outcome: "invalid" };
  }

  if (isLegacyDefault(raw)) return { config: fresh, outcome: "upgraded-default" };

  const migrated = migrateLegacyConfig(raw);
  return migrated
    ? { config: migrated, outcome: "migrated-custom" }
    : { config: fresh, outcome: "invalid" };
};

export const periodConfigsEqual = (a: PeriodTimeConfig, b: PeriodTimeConfig): boolean =>
  a.morningPeriods === b.morningPeriods &&
  a.afternoonPeriods === b.afternoonPeriods &&
  a.eveningPeriods === b.eveningPeriods &&
  a.periods.length === b.periods.length &&
  a.periods.every((range, i) => range.start === b.periods[i].start && range.end === b.periods[i].end);
