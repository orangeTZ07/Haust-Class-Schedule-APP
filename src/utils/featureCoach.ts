// 操作引导按「步骤内容 id」记住看过没有，不看应用版本。
// id 变了（文案或指向变了）才算新步骤。老用户只看到没见过的 id，并带「新功能」；
// 第一次打开（存储键还不存在）把当前全部可展示步骤走一遍，不加这个前缀。
//
// 汉堡菜单里的「操作指南」重放全部步骤，不改已看记录。

export const COACH_SEEN_STEP_IDS_KEY = "course-mngr-coach-seen-step-ids";

export const COACH_CUE_LABEL = "新功能介绍请前往此处";

export type CoachTarget =
  | "menu"
  | "import"
  | "empty-cell"
  | "course-block"
  | "appearance"
  | "period-timing";

export const APPEARANCE_STEP_ID = "appearance-settings-v1";
export const PERIOD_TIMING_STEP_ID = "period-timing-settings-v1";
/// Cue 「新功能介绍请前往此处」 lands here — not the sidebar 「设置」 row.
export const SETTINGS_COACH_PATH = "/settings";

export const isSettingsCoachTarget = (target: CoachTarget | undefined | null): boolean =>
  target === "appearance" || target === "period-timing";

export const firstSettingsCoachIndex = (steps: ReadonlyArray<{ target: CoachTarget }>): number => {
  const index = steps.findIndex(step => isSettingsCoachTarget(step.target));
  return index < 0 ? 0 : index;
};

export interface CoachStep {
  id: string;
  title: string;
  body: string;
  target: CoachTarget;
  /// The thing being introduced is not on the home screen. Show a cue on the way there first.
  offHome: boolean;
  /// Auto-show only once the week on screen actually has courses, so the empty cell is a real gap.
  /// While this is false the step is not shown and must not be marked seen.
  requiresCoursesOnCurrentWeek: boolean;
}

export interface CoachPresentation extends CoachStep {
  /// Rendered as bold 「新功能」 in front of the body. Equivalent of a markdown **新功能** prefix.
  prefixNew: boolean;
}

export const COACH_STEPS: CoachStep[] = [
  {
    id: "double-tap-empty-add-v1",
    title: "双击空白加课",
    // 编辑模式上线后换成新 id（double-tap-empty-add-v2）。正文只留这一句，不要提回退开关，计数本身也不单独做一步：
    // 「编辑后可一直点撤销，回退到更早的改动」
    body: "双击没有课程的格子，添加一节课。",
    target: "empty-cell",
    offHome: false,
    requiresCoursesOnCurrentWeek: true
  },
  {
    id: "delete-course-v1",
    title: "拖动删除课程",
    body: "长按课程拖到顶栏垃圾桶即可删除。松手后会再问你删整学期、仅当前周还是自定义周次。",
    target: "course-block",
    offHome: false,
    requiresCoursesOnCurrentWeek: true
  },
  {
    id: "menu-reopen-guide-v1",
    title: "菜单",
    body: "点左上角菜单可以导入课表。这份说明也能从菜单里的「操作指南」随时再打开。",
    target: "menu",
    offHome: false,
    requiresCoursesOnCurrentWeek: false
  },
  {
    id: "import-from-menu-v1",
    title: "导入课表",
    body: "教务系统同步和 AI 识别都在菜单的「导入课表」里。",
    target: "import",
    offHome: true,
    requiresCoursesOnCurrentWeek: false
  },
  {
    id: APPEARANCE_STEP_ID,
    title: "外观",
    body: "在设置里可以换预设主题，也可以自己设背景图。",
    target: "appearance",
    offHome: true,
    requiresCoursesOnCurrentWeek: false
  },
  {
    id: PERIOD_TIMING_STEP_ID,
    title: "课时与课间",
    body: "在这里可以调每节课时长和课间间隔，提醒时间会跟着变。",
    target: "period-timing",
    offHome: true,
    requiresCoursesOnCurrentWeek: false
  }
];

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/// null：键不存在，按第一次打开处理。键在但内容坏了：当成老用户、还没看过任何当前步骤。
export const readSeenStepIds = (storage: StorageLike): string[] | null => {
  const raw = storage.getItem(COACH_SEEN_STEP_IDS_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
};

/// 只增不删。手动重开引导不要调用它去清空。
export const addSeenStepIds = (storage: StorageLike, ids: string[]): void => {
  const current = new Set(readSeenStepIds(storage) ?? []);
  for (const id of ids) current.add(id);
  storage.setItem(COACH_SEEN_STEP_IDS_KEY, JSON.stringify([...current]));
};

const present = (steps: CoachStep[], prefixNew: boolean): CoachPresentation[] =>
  steps.map(step => ({ ...step, prefixNew }));

/// Fingerprint of the saved timetable, not of the week on screen. Closing import or coming back
/// to home does not change it; a reimport or an edit does.
export const timetableFingerprint = (
  tableId: number,
  schedules: ReadonlyArray<{
    id: number;
    dayOfWeek: number;
    startPeriod: number;
    endPeriod: number;
    startWeek: number;
    endWeek: number;
  }>
): string =>
  `${tableId}:${[...schedules]
    .map(item => `${item.id}:${item.dayOfWeek}:${item.startPeriod}-${item.endPeriod}:${item.startWeek}-${item.endWeek}`)
    .sort()
    .join("|")}`;

/// This session already failed to find an empty cell on this week + this timetable.
/// Not written to seen-ids: flipping week or changing the table can show the step later.
let emptyCellDeferral: { week: number; fingerprint: string } | null = null;
let courseBlockDeferral: { week: number; fingerprint: string } | null = null;

export const rememberEmptyCellUnanchored = (week: number, fingerprint: string): void => {
  emptyCellDeferral = { week, fingerprint };
};

export const isEmptyCellDeferred = (week: number, fingerprint: string): boolean =>
  emptyCellDeferral !== null &&
  emptyCellDeferral.week === week &&
  emptyCellDeferral.fingerprint === fingerprint;

export const resetEmptyCellDeferral = (): void => {
  emptyCellDeferral = null;
};

export const rememberCourseBlockUnanchored = (week: number, fingerprint: string): void => {
  courseBlockDeferral = { week, fingerprint };
};

export const isCourseBlockDeferred = (week: number, fingerprint: string): boolean =>
  courseBlockDeferral !== null &&
  courseBlockDeferral.week === week &&
  courseBlockDeferral.fingerprint === fingerprint;

export const resetCourseBlockDeferral = (): void => {
  courseBlockDeferral = null;
};

/// Grid not painted yet → wait. Cells exist but none empty → skip this step. Otherwise point at one.
export const emptyCellAnchorState = (
  gridCellCount: number,
  emptyCellCount: number
): "waiting" | "missing" | "ready" => {
  if (gridCellCount <= 0) return "waiting";
  if (emptyCellCount <= 0) return "missing";
  return "ready";
};

/// Grid not painted yet → wait. Painted but no course card to point at → skip. Otherwise ready.
export const courseBlockAnchorState = (
  gridCellCount: number,
  courseBlockCount: number
): "waiting" | "missing" | "ready" => {
  if (gridCellCount <= 0) return "waiting";
  if (courseBlockCount <= 0) return "missing";
  return "ready";
};

/// Steps to show on launch. Deferred steps (no courses yet, or no empty cell on this week/data)
/// are omitted, not marked seen by the caller.
export const autoCoachQueue = (options: {
  seenIds: string[] | null;
  hasCoursesOnCurrentWeek: boolean;
  /// Same session, same week, same table: do not put the empty-cell step back in.
  deferEmptyCell?: boolean;
  /// Same idea for the delete step when this week has no course card to point at.
  deferCourseBlock?: boolean;
}): CoachPresentation[] => {
  const fresh = options.seenIds === null;
  const seen = new Set(options.seenIds ?? []);
  const steps = COACH_STEPS.filter(step => {
    if (seen.has(step.id)) return false;
    if (step.requiresCoursesOnCurrentWeek && !options.hasCoursesOnCurrentWeek) return false;
    if (options.deferEmptyCell && step.target === "empty-cell") return false;
    if (options.deferCourseBlock && step.target === "course-block") return false;
    return true;
  });
  return present(steps, !fresh);
};

/// Full tutorial from the menu. No 「新功能」 prefix, and this list is not a reason to clear seen ids.
export const manualCoachQueue = (): CoachPresentation[] => present(COACH_STEPS, false);

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BubblePlacement {
  top: number;
  left: number;
  width: number;
  height: number;
  side: "above" | "below";
}

const GAP = 8;

/// Place a bubble next to a measured target, inside the safe viewport.
/// Prefers the side with enough room; clamps into the notch / gesture-bar insets on a short or narrow screen.
export const placeBubble = (
  target: Rect,
  viewport: { width: number; height: number },
  safe: Insets,
  preferred: { width: number; height: number }
): BubblePlacement => {
  const availLeft = safe.left + GAP;
  const availTop = safe.top + GAP;
  const availRight = Math.max(availLeft, viewport.width - safe.right - GAP);
  const availBottom = Math.max(availTop, viewport.height - safe.bottom - GAP);
  const availWidth = Math.max(0, availRight - availLeft);
  const availHeight = Math.max(0, availBottom - availTop);

  const width = Math.min(Math.max(preferred.width, 0), availWidth);
  const height = Math.min(Math.max(preferred.height, 0), availHeight);
  const targetMidX = target.left + target.width / 2;
  const unclampedLeft = targetMidX - width / 2;
  const left = Math.min(Math.max(unclampedLeft, availLeft), Math.max(availLeft, availRight - width));

  const spaceAbove = target.top - GAP - availTop;
  const spaceBelow = availBottom - (target.top + target.height) - GAP;
  const side: "above" | "below" =
    spaceBelow >= preferred.height || spaceBelow >= spaceAbove ? "below" : "above";

  const unclampedTop = side === "below"
    ? target.top + target.height + GAP
    : target.top - GAP - height;
  const top = Math.min(Math.max(unclampedTop, availTop), Math.max(availTop, availBottom - height));

  return { top, left, width, height, side };
};

const fullyInside = (rect: Rect, view: Rect): boolean =>
  rect.left >= view.left &&
  rect.top >= view.top &&
  rect.left + rect.width <= view.left + view.width &&
  rect.top + rect.height <= view.top + view.height;

const centerDistance = (rect: Rect, view: Rect): number => {
  const dx = rect.left + rect.width / 2 - (view.left + view.width / 2);
  const dy = rect.top + rect.height / 2 - (view.top + view.height / 2);
  return dx * dx + dy * dy;
};

/// Index of the empty cell to point at: one fully on screen, nearest the middle of the grid.
/// Returns -1 when there is no cell. Caller must not mark the step seen in that case.
export const chooseAnchorIndex = (rects: Rect[], view: Rect): number => {
  if (rects.length === 0) return -1;
  let best = 0;
  let bestInside = fullyInside(rects[0], view);
  let bestDistance = centerDistance(rects[0], view);
  for (let index = 1; index < rects.length; index++) {
    const inside = fullyInside(rects[index], view);
    const distance = centerDistance(rects[index], view);
    if ((inside && !bestInside) || (inside === bestInside && distance < bestDistance)) {
      best = index;
      bestInside = inside;
      bestDistance = distance;
    }
  }
  return best;
};
