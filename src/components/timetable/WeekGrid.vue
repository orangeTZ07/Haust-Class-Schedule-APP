<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useCourses } from "@/composables/useCourses";
import { useToday } from "@/composables/useToday";
import { isDraggingSchedule, offsetForSchedule } from "@/utils/dragOffset";
import CourseBlock from "./CourseBlock.vue";

const { periodSlots, effectiveSchedules, courses, periodConfig, currentWeek, weekDateLabels, moveSchedule, commitEdit } = useCourses();
const { todayDayNumber: calendarDayNumber, actualWeek } = useToday();

const emit = defineEmits<{
  (e: "drag-trash-state-change", state: { visible: boolean; active: boolean }): void;
  (e: "request-add", slot: { day: number; period: number }): void;
  (e: "request-delete", payload: { scheduleId: number }): void;
}>();

const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const dayNumbers = [1, 2, 3, 4, 5, 6, 7];

interface MergedBlock {
  schedule: import("@/types/course").CourseSchedule;
  course: import("@/types/course").Course;
  startPeriod: number;
  endPeriod: number;
  span: number;
}

interface ConflictGroup {
  id: string;
  day: number;
  anchorPeriod: number;
  anchorScheduleId: number;
  blocks: MergedBlock[];
}

interface DragState {
  scheduleId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  span: number;
  hasMoved: boolean;
  source: "grid" | "floating" | "embedded-conflict";
}

interface ConflictOrbitLayout {
  centerX: number;
  centerY: number;
  boundaryLeft: number;
  boundaryTop: number;
  boundaryWidth: number;
  boundaryHeight: number;
  contentHeight: number;
  originFrames: Record<number, FloatingFrame>;
}

interface FloatingFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  boundaryLeft?: number;
  boundaryTop?: number;
  boundaryWidth: number;
  boundaryHeight: number;
}

interface DropPreviewFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  valid: boolean;
}

type OrbitPhase = "idle" | "opening" | "open" | "closing";

const bodyRef = ref<HTMLElement | null>(null);
const dragState = ref<DragState | null>(null);
let dragPointerId = -1;
let dragSourceEl: HTMLElement | null = null;
const dropTarget = ref<{ day: number; period: number; valid: boolean } | null>(null);
const openConflictGroupId = ref<string | null>(null);
const closingConflictGroupId = ref<string | null>(null);
const activeConflictLayout = ref<ConflictOrbitLayout | null>(null);
const gridZoom = ref(1);
const pinchState = ref<{ startDistance: number; startScale: number } | null>(null);
const orbitPhase = ref<OrbitPhase>("idle");
const suppressNextClick = ref(false);
// Schedule id currently playing its delete animation, if any. The row is only removed from
// the database once the block has visibly left, so a delete reads as an action rather than
// the block vanishing between frames.
const deletingId = ref<number | null>(null);
const DELETE_ANIMATION_MS = 240;
let orbitAnimationTimer: ReturnType<typeof window.setTimeout> | null = null;

const playDeleteAnimation = async (scheduleId: number) => {
  deletingId.value = scheduleId;
  await new Promise(resolve => setTimeout(resolve, DELETE_ANIMATION_MS));
  deletingId.value = null;
};

const MIN_GRID_WIDTH = 360;
const MAX_GRID_ZOOM = 2.2;
const ORBIT_OPEN_DURATION_MS = 420;
const ORBIT_CLOSE_DURATION_MS = 280;

/// Puts the view back to how it looks on a fresh open, and reports whether anything moved.
///
/// Three things can carry the view away from that state, and an earlier revision only knew about
/// the first two: the pinch zoom, the outer container's horizontal offset, and -- the one people
/// actually hit -- .body's vertical scroll, since scrolling down to the later periods is the
/// ordinary way the timetable "moves". Leaving it out meant the reset changed nothing while still
/// reporting success.
///
/// Returning whether anything changed lets the caller distinguish a real reset from a no-op,
/// because a no-op and a dead button are otherwise the same message.
const resetView = (): boolean => {
  const body = bodyRef.value;
  const changed =
    gridZoom.value !== 1 ||
    (body?.scrollTop ?? 0) !== 0 ||
    (body?.scrollLeft ?? 0) !== 0;

  gridZoom.value = 1;
  if (body) {
    body.scrollTop = 0;
    body.scrollLeft = 0;
  }

  return changed;
};

defineExpose({ resetView, playDeleteAnimation });

/// Today's column (1-7), or 0 when there is none to mark. Only the week that is really the current
/// one has a "today": the weekday alone says nothing about which week is on screen, and marking it
/// anyway put today's highlight on the Wednesday of week 5 while week 6 was the actual one.
const todayDayNumber = computed(() => {
  return actualWeek.value !== null && actualWeek.value === currentWeek.value ? calendarDayNumber.value : 0;
});

/// Cosmetic only, nothing to do with the gestures: which way the week just changed, so the new
/// week's content can slide in from that side, and a short-lived flag the styles use to run that
/// slide (and to keep the blocks' own pop-in quiet while it plays).
const weekSlideDirection = ref(1);
const weekSwitching = ref(false);
/// A little longer than the longest animation it gates, so the flag never drops mid-animation.
const WEEK_SWITCH_MS = 420;
let weekSwitchTimer: ReturnType<typeof window.setTimeout> | null = null;

const weekGridStyle = computed(() => ({
  "--week-grid-min-width": `${Math.round(MIN_GRID_WIDTH * gridZoom.value)}px`,
  "--week-dir": weekSlideDirection.value
}));

const totalPeriods = computed(() => {
  const config = periodConfig.value;
  return config.morningPeriods + config.afternoonPeriods + (config.eveningPeriods || 0);
});

const allBlocks = computed(() => {
  const blocks: MergedBlock[] = [];
  for (const schedule of effectiveSchedules.value) {
    const course = courses.value.find(c => c.id === schedule.courseId);
    if (!course) continue;

    blocks.push({
      schedule,
      course,
      startPeriod: schedule.startPeriod,
      endPeriod: schedule.endPeriod,
      span: schedule.endPeriod - schedule.startPeriod + 1
    });
  }
  return blocks;
});

const schedulesOverlap = (
  first: import("@/types/course").CourseSchedule,
  second: import("@/types/course").CourseSchedule
) => {
  return first.dayOfWeek === second.dayOfWeek &&
    first.startPeriod <= second.endPeriod &&
    second.startPeriod <= first.endPeriod;
};

const conflictGroups = computed(() => {
  const groups: ConflictGroup[] = [];
  const visited = new Set<number>();

  for (const block of allBlocks.value) {
    if (visited.has(block.schedule.id)) continue;

    const queue = [block];
    const group: MergedBlock[] = [];
    visited.add(block.schedule.id);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      group.push(current);

      for (const candidate of allBlocks.value) {
        if (visited.has(candidate.schedule.id)) continue;
        if (!schedulesOverlap(current.schedule, candidate.schedule)) continue;
        visited.add(candidate.schedule.id);
        queue.push(candidate);
      }
    }

    if (group.length <= 1) continue;

    const sortedGroup = [...group].sort((a, b) => {
      return a.startPeriod - b.startPeriod || a.schedule.id - b.schedule.id;
    });
    const anchorBlock = sortedGroup[0];

    groups.push({
      id: `conflict-${sortedGroup.map(item => item.schedule.id).join("-")}`,
      day: anchorBlock.schedule.dayOfWeek,
      anchorPeriod: anchorBlock.startPeriod,
      anchorScheduleId: anchorBlock.schedule.id,
      blocks: sortedGroup
    });
  }

  return groups;
});

const conflictGroupByScheduleId = computed(() => {
  const map = new Map<number, ConflictGroup>();
  for (const group of conflictGroups.value) {
    for (const block of group.blocks) {
      map.set(block.schedule.id, group);
    }
  }
  return map;
});

const displayedConflictGroupId = computed(() => openConflictGroupId.value || closingConflictGroupId.value);

const activeConflictGroup = computed(() => {
  if (!displayedConflictGroupId.value) return null;
  return conflictGroups.value.find(group => group.id === displayedConflictGroupId.value) || null;
});

const getConflictMeta = (scheduleId: number) => {
  const group = conflictGroupByScheduleId.value.get(scheduleId);
  if (!group) {
    return { count: 1, index: 0 };
  }

  const index = group.blocks.findIndex(block => block.schedule.id === scheduleId);
  return {
    count: group.blocks.length,
    index: index === -1 ? 0 : index
  };
};

const dividerPositions = computed(() => {
  const config = periodConfig.value;
  const positions: Array<{ afterPeriod: number; label: string }> = [];

  if (config.morningPeriods > 0) {
    positions.push({
      afterPeriod: config.morningPeriods,
      label: "午"
    });
  }

  if (config.afternoonPeriods > 0) {
    positions.push({
      afterPeriod: config.morningPeriods + config.afternoonPeriods,
      label: "晚"
    });
  }

  return positions;
});

const shouldShowDividerAfter = (period: number): boolean => {
  return dividerPositions.value.some(d => d.afterPeriod === period);
};

/// How many 午休 / 晚饭 dividers sit inside a block's span, i.e. strictly between its first
/// and last period. CourseBlock turns this into height via var(--divider-height); the count
/// is passed rather than a pixel value so the divider height keeps a single definition.
const countDividersWithin = (startPeriod: number, span: number): number => {
  let dividers = 0;
  for (let period = startPeriod; period < startPeriod + span - 1; period++) {
    if (shouldShowDividerAfter(period)) dividers++;
  }
  return dividers;
};

// Tapping an empty slot is how a course gets added. Two guards keep that from firing at the
// wrong moment: a cell that already holds a block is left to the block, and a drag swallows
// cell clicks for a short window afterwards, because dropping a course onto a free slot
// would otherwise immediately pop the add form over the cell it just landed in.
let suppressCellClickUntil = 0;

// Two taps on the same empty slot, close together, open the add form.
//
// A single tap used to be enough, which made every stray touch on the timetable a candidate for
// opening a course form -- and the grid is mostly empty space, so mis-taps were common. The first
// tap is deliberately silent: an earlier version raised a toast telling the user to tap again, but
// it sat over the timetable and hid the very cells it was talking about.
const DOUBLE_TAP_MS = 400;
let lastSlotTap = { day: 0, period: 0, at: 0 };

const handleCellClick = (day: number, period: number) => {
  if (Date.now() < suppressCellClickUntil) return;
  if (dragState.value) return;
  if (getBlocksByDayAndPeriod(day, period).length > 0) return;

  const now = Date.now();
  const isSecondTap =
    lastSlotTap.day === day && lastSlotTap.period === period && now - lastSlotTap.at <= DOUBLE_TAP_MS;

  if (isSecondTap) {
    lastSlotTap = { day: 0, period: 0, at: 0 };
    emit("request-add", { day, period });
    return;
  }

  lastSlotTap = { day, period, at: now };
};

const getDividerLabel = (period: number): string => {
  const divider = dividerPositions.value.find(d => d.afterPeriod === period);
  return divider?.label || "";
};

const isBigSessionEnd = (period: number): boolean => {
  const config = periodConfig.value;
  let localPeriod: number;

  if (period <= config.morningPeriods) {
    localPeriod = period;
  } else if (period <= config.morningPeriods + config.afternoonPeriods) {
    localPeriod = period - config.morningPeriods;
  } else {
    localPeriod = period - config.morningPeriods - config.afternoonPeriods;
  }

  return localPeriod % 2 === 0;
};

const getBlocksByDayAndPeriod = (day: number, period: number) => {
  return allBlocks.value.filter(block => {
    if (block.schedule.dayOfWeek !== day || block.startPeriod !== period) return false;

    const group = conflictGroupByScheduleId.value.get(block.schedule.id);
    if (!group) return true;

    return displayedConflictGroupId.value !== group.id;
  });
};

const measureConflictOrbit = (group: ConflictGroup, triggerElement?: HTMLElement | null) => {
  const body = bodyRef.value;
  if (!body || !triggerElement) return;

  const bodyRect = body.getBoundingClientRect();
  const triggerRect = triggerElement.getBoundingClientRect();
  const centerX = triggerRect.left - bodyRect.left + body.scrollLeft + triggerRect.width / 2;
  const centerY = triggerRect.top - bodyRect.top + body.scrollTop + triggerRect.height / 2;
  const originFrames: Record<number, FloatingFrame> = {};

  for (const block of group.blocks) {
    const element = body.querySelector<HTMLElement>(`.course-block[data-schedule-id="${block.schedule.id}"]`);
    const rect = element?.getBoundingClientRect();
    if (!rect) continue;

    originFrames[block.schedule.id] = {
      left: rect.left - bodyRect.left + body.scrollLeft,
      top: rect.top - bodyRect.top + body.scrollTop,
      width: rect.width,
      height: rect.height,
      boundaryLeft: 0,
      boundaryTop: body.scrollTop,
      boundaryWidth: body.clientWidth,
      boundaryHeight: body.clientHeight
    };
  }

  activeConflictLayout.value = {
    centerX,
    centerY,
    boundaryLeft: 0,
    boundaryTop: body.scrollTop,
    boundaryWidth: body.clientWidth,
    boundaryHeight: body.clientHeight,
    contentHeight: Math.max(body.scrollHeight, body.clientHeight),
    originFrames
  };
};

const clearOrbitAnimationTimer = () => {
  if (orbitAnimationTimer !== null) {
    window.clearTimeout(orbitAnimationTimer);
    orbitAnimationTimer = null;
  }
};

const clearConflictOrbitImmediately = () => {
  clearOrbitAnimationTimer();
  openConflictGroupId.value = null;
  closingConflictGroupId.value = null;
  activeConflictLayout.value = null;
  orbitPhase.value = "idle";
};

const closeConflictGroup = () => {
  const currentGroupId = displayedConflictGroupId.value;
  if (!currentGroupId || !activeConflictLayout.value) {
    clearConflictOrbitImmediately();
    return;
  }

  if (orbitPhase.value === "closing") {
    return;
  }

  clearOrbitAnimationTimer();
  openConflictGroupId.value = null;
  closingConflictGroupId.value = currentGroupId;
  orbitPhase.value = "closing";
  orbitAnimationTimer = window.setTimeout(() => {
    clearConflictOrbitImmediately();
  }, ORBIT_CLOSE_DURATION_MS);
};

const handleGlobalClick = (event: MouseEvent) => {
  if (suppressNextClick.value) {
    suppressNextClick.value = false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return;
  }

  if (!openConflictGroupId.value || dragState.value) return;
  if (!(event.target instanceof HTMLElement)) return;

  if (event.target.closest(".orbit-card") || event.target.closest(".conflict-orbit-center")) {
    return;
  }

  closeConflictGroup();
};

const openConflictGroupFromBlock = async (block: MergedBlock, event: MouseEvent) => {
  const group = conflictGroupByScheduleId.value.get(block.schedule.id);
  if (!group) return;

  if (displayedConflictGroupId.value === group.id && orbitPhase.value !== "closing") {
    closeConflictGroup();
    return;
  }

  const triggerElement = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : event.target instanceof HTMLElement
      ? event.target.closest(".course-block")
      : null;

  clearOrbitAnimationTimer();
  measureConflictOrbit(group, triggerElement instanceof HTMLElement ? triggerElement : null);
  closingConflictGroupId.value = null;
  openConflictGroupId.value = group.id;
  orbitPhase.value = "opening";
  orbitAnimationTimer = window.setTimeout(() => {
    if (openConflictGroupId.value === group.id) {
      orbitPhase.value = "open";
    }
    orbitAnimationTimer = null;
  }, ORBIT_OPEN_DURATION_MS);
  await nextTick();
};

const getOrbitAngle = (index: number, total: number) => {
  if (total === 1) return -Math.PI / 2;
  return -Math.PI / 2 + (Math.PI * 2 * index) / total;
};

const clamp = (value: number, min: number, max: number) => {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
};

const getNearestDistanceToRect = (
  pointX: number,
  pointY: number,
  left: number,
  top: number,
  width: number,
  height: number
) => {
  const nearestX = clamp(pointX, left, left + width);
  const nearestY = clamp(pointY, top, top + height);
  return Math.hypot(nearestX - pointX, nearestY - pointY);
};

const applyOrbitCenterRepulsion = (
  left: number,
  top: number,
  width: number,
  height: number,
  angle: number
) => {
  const layout = activeConflictLayout.value;
  if (!layout) {
    return { left, top };
  }

  const minLeft = layout.boundaryLeft + 6;
  const maxLeft = layout.boundaryLeft + layout.boundaryWidth - width - 6;
  const minTop = layout.boundaryTop + 6;
  const maxTop = layout.boundaryTop + layout.boundaryHeight - height - 6;
  const desiredClearance = 24;

  let nextLeft = clamp(left, minLeft, maxLeft);
  let nextTop = clamp(top, minTop, maxTop);
  const outwardX = Math.cos(angle);
  const outwardY = Math.sin(angle);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const distanceToRect = getNearestDistanceToRect(
      layout.centerX,
      layout.centerY,
      nextLeft,
      nextTop,
      width,
      height
    );
    const deficit = desiredClearance - distanceToRect;
    if (deficit <= 0) {
      break;
    }

    const pushDistance = deficit + 10;
    nextLeft = clamp(nextLeft + outwardX * pushDistance, minLeft, maxLeft);
    nextTop = clamp(nextTop + outwardY * pushDistance, minTop, maxTop);
  }

  return {
    left: nextLeft,
    top: nextTop
  };
};

const getHorizontalTouchDistance = (touches: TouchList) => {
  if (touches.length < 2) return 0;
  return Math.abs(touches[0].clientX - touches[1].clientX);
};

const handleTouchStart = (event: TouchEvent) => {
  if (event.touches.length !== 2) return;
  const distance = getHorizontalTouchDistance(event.touches);
  if (distance < 24) return;

  pinchState.value = {
    startDistance: distance,
    startScale: gridZoom.value
  };
};

const handleTouchMove = (event: TouchEvent) => {
  // A drag in progress owns the gesture: without this the browser would also scroll the
  // page under the finger, because course blocks are touch-action: pan-y.
  if (dragState.value) {
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (!pinchState.value || event.touches.length !== 2) return;
  const distance = getHorizontalTouchDistance(event.touches);
  if (distance < 24) return;

  if (event.cancelable) {
    event.preventDefault();
  }

  const nextScale = pinchState.value.startScale * (distance / pinchState.value.startDistance);
  gridZoom.value = Math.round(clamp(nextScale, 1, MAX_GRID_ZOOM) * 100) / 100;
};

const handleTouchEnd = (event: TouchEvent) => {
  if (event.touches.length >= 2) return;
  pinchState.value = null;
};

const getFloatingFrame = (block: MergedBlock, index: number, total: number): FloatingFrame | null => {
  if (!activeConflictLayout.value) return null;
  const originFrame = activeConflictLayout.value.originFrames[block.schedule.id];
  if (!originFrame) return null;

  const radius = 18 + Math.min(total * 8, 24);
  const angle = getOrbitAngle(index, total);
  const width = originFrame.width;
  const height = originFrame.height;
  const rawLeft = originFrame.left + Math.cos(angle) * radius;
  const rawTop = originFrame.top + Math.sin(angle) * radius;
  const clampedLeft = clamp(
    rawLeft,
    activeConflictLayout.value.boundaryLeft + 6,
    activeConflictLayout.value.boundaryLeft + activeConflictLayout.value.boundaryWidth - width - 6
  );
  const clampedTop = clamp(
    rawTop,
    activeConflictLayout.value.boundaryTop + 6,
    activeConflictLayout.value.boundaryTop + activeConflictLayout.value.boundaryHeight - height - 6
  );
  const { left, top } = applyOrbitCenterRepulsion(clampedLeft, clampedTop, width, height, angle);

  return {
    left,
    top,
    width,
    height,
    boundaryLeft: activeConflictLayout.value.boundaryLeft,
    boundaryTop: activeConflictLayout.value.boundaryTop,
    boundaryWidth: activeConflictLayout.value.boundaryWidth,
    boundaryHeight: activeConflictLayout.value.boundaryHeight
  };
};

const getFloatingLine = (block: MergedBlock, index: number, total: number) => {
  const frame = getFloatingFrame(block, index, total);
  if (!frame || !activeConflictLayout.value) return null;
  const dragOffset = getBlockDragOffset(block.schedule.id);

  return {
    x1: activeConflictLayout.value.centerX,
    y1: activeConflictLayout.value.centerY,
    x2: frame.left + frame.width / 2 + dragOffset.x,
    y2: frame.top + frame.height / 2 + dragOffset.y
  };
};

const getOrbitMotionStyle = (block: MergedBlock, index: number, total: number) => {
  const frame = getFloatingFrame(block, index, total);
  const layout = activeConflictLayout.value;
  if (!frame || !layout) return {};

  const deltaX = frame.left + frame.width / 2 - layout.centerX;
  const deltaY = frame.top + frame.height / 2 - layout.centerY;
  const twist = ((index % 2 === 0 ? 1 : -1) * (8 + index * 2)).toString();
  const delay = `${index * 28}ms`;

  return {
    "--orbit-dx": `${deltaX}px`,
    "--orbit-dy": `${deltaY}px`,
    "--orbit-twist": twist,
    "--orbit-delay": delay
  };
};

const getOrbitLineStyle = (block: MergedBlock, index: number, total: number) => {
  const line = getFloatingLine(block, index, total);
  if (!line) return {};

  return {
    "--orbit-line-length": `${Math.hypot(line.x2 - line.x1, line.y2 - line.y1).toFixed(2)}px`,
    "--orbit-delay": `${index * 28}ms`
  };
};

const readCellFromPoint = (clientX: number, clientY: number) => {
  const elements = document.elementsFromPoint(clientX, clientY);
  const cell = elements
    .find(element => !(element instanceof HTMLElement) || !element.closest(".conflict-orbit-center"))
    ?.closest<HTMLElement>(".cell[data-day][data-period]");
  if (!cell) return null;

  const day = Number(cell.dataset.day);
  const period = Number(cell.dataset.period);
  if (!Number.isFinite(day) || !Number.isFinite(period)) return null;

  return { day, period };
};

const updateDropTarget = (clientX: number, clientY: number) => {
  if (!dragState.value) return;
  const target = readCellFromPoint(clientX, clientY);
  if (!target) {
    dropTarget.value = null;
    return;
  }

  dropTarget.value = {
    ...target,
    valid: target.period + dragState.value.span - 1 <= totalPeriods.value
  };
};

// How far outside the trash icon a finger still counts as "over" it. The old test was
// document.elementsFromPoint against the icon's exact border box, which asked a fingertip for
// pixel precision. The tolerance lives here rather than in the icon's padding because growing
// the box would move the icon; the icon is 44px, so the drop zone is roughly 124px across.
const TRASH_TARGET_SLOP = 40;

const isPointerOverTrashTarget = (clientX: number, clientY: number) => {
  const target = document.querySelector<HTMLElement>('[data-trash-target="schedule-delete"]');
  if (!target) return false;

  const rect = target.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  // Shortest distance from the point to the rectangle -- zero when inside it.
  const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
  const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
  return Math.hypot(dx, dy) <= TRASH_TARGET_SLOP;
};

const syncDragTrashState = (clientX?: number, clientY?: number) => {
  const visible = !!dragState.value?.hasMoved;
  const active = visible && typeof clientX === "number" && typeof clientY === "number"
    ? isPointerOverTrashTarget(clientX, clientY)
    : false;

  emit("drag-trash-state-change", { visible, active });
  return active;
};

const handlePointerMove = (event: PointerEvent) => {
  if (!dragState.value) return;
  if (dragPointerId !== -1 && event.pointerId !== dragPointerId) return;

  const offsetX = event.clientX - dragState.value.startX;
  const offsetY = event.clientY - dragState.value.startY;
  dragState.value.offsetX = offsetX;
  dragState.value.offsetY = offsetY;
  dragState.value.hasMoved = dragState.value.hasMoved || Math.hypot(offsetX, offsetY) > 6;

  if (dragState.value.hasMoved) {
    const overTrashTarget = syncDragTrashState(event.clientX, event.clientY);
    if (overTrashTarget) {
      dropTarget.value = null;
      return;
    }

    updateDropTarget(event.clientX, event.clientY);
  } else {
    syncDragTrashState();
  }
};

const stopDragListeners = () => {
  window.removeEventListener("pointermove", handlePointerMove, true);
  window.removeEventListener("pointerup", handlePointerUp, true);
  window.removeEventListener("pointercancel", cancelDrag, true);
};

const releaseDragCapture = () => {
  if (dragSourceEl && dragPointerId !== -1) {
    try {
      if (dragSourceEl.hasPointerCapture?.(dragPointerId)) {
        dragSourceEl.releasePointerCapture(dragPointerId);
      }
    } catch {
      // Capture is already gone (unmount, cancelled pointer). Fine.
    }
  }
  dragPointerId = -1;
  dragSourceEl = null;
};

const endDragGesture = () => {
  stopDragListeners();
  releaseDragCapture();
  dragState.value = null;
  dropTarget.value = null;
  syncDragTrashState();
};

const cancelDrag = () => {
  endDragGesture();
};

const handlePointerUp = async (event: PointerEvent) => {
  if (dragPointerId !== -1 && event.pointerId !== dragPointerId) return;

  const currentDrag = dragState.value;
  const currentTarget = dropTarget.value;
  const shouldDelete = currentDrag?.hasMoved
    ? syncDragTrashState(event.clientX, event.clientY)
    : false;

  if (currentDrag?.hasMoved && currentDrag.source === "embedded-conflict") {
    suppressNextClick.value = true;
  }

  // Drop the gesture immediately so the undo bar is tappable and no other card
  // keeps following the pointer while a dialog or the database write runs.
  endDragGesture();

  if (shouldDelete && currentDrag?.hasMoved) {
    if (currentDrag.source === "floating" || conflictGroupByScheduleId.value.has(currentDrag.scheduleId)) {
      clearConflictOrbitImmediately();
    }
    emit("request-delete", { scheduleId: currentDrag.scheduleId });
    return;
  }

  if (!currentDrag?.hasMoved || !currentTarget?.valid) {
    return;
  }

  const schedule = effectiveSchedules.value.find(s => s.id === currentDrag.scheduleId);
  const changed = schedule &&
    (schedule.dayOfWeek !== currentTarget.day || schedule.startPeriod !== currentTarget.period);

  if (changed) {
    const moved = await moveSchedule(currentDrag.scheduleId, currentTarget.day, currentTarget.period);
    if (moved) commitEdit();
    if (currentDrag.source === "floating") {
      closeConflictGroup();
    }
  }
};

// Touch must not start a drag on contact. A finger landing on a course block is far more
// often the beginning of a scroll than of a re-schedule, and because the blocks cover
// nearly the whole grid, starting the drag immediately made the timetable feel frozen and
// turned small swipes into accidental course moves. Mouse keeps its instant drag; touch
// has to hold briefly first.
const LONG_PRESS_MS = 280;
const LONG_PRESS_TOLERANCE = 12;

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressOrigin: { x: number; y: number } | null = null;

const clearLongPress = () => {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressOrigin = null;
  window.removeEventListener("pointermove", onLongPressMove);
  window.removeEventListener("pointerup", clearLongPress);
  window.removeEventListener("pointercancel", clearLongPress);
};

function onLongPressMove(event: PointerEvent) {
  if (!longPressOrigin) return;
  const travelled = Math.hypot(
    event.clientX - longPressOrigin.x,
    event.clientY - longPressOrigin.y
  );
  // The finger is travelling, i.e. the user is scrolling -- let the browser have it.
  if (travelled > LONG_PRESS_TOLERANCE) clearLongPress();
}

const startDrag = (
  block: MergedBlock,
  event: PointerEvent,
  source: "grid" | "floating" | "embedded-conflict" = "grid"
) => {
  if (event.pointerType === "mouse") {
    beginDrag(block, event, source);
    return;
  }

  clearLongPress();
  longPressOrigin = { x: event.clientX, y: event.clientY };
  const held = event;
  longPressTimer = setTimeout(() => {
    const origin = longPressOrigin;
    clearLongPress();
    if (!origin) return;
    navigator.vibrate?.(10);
    beginDrag(block, held, source);
  }, LONG_PRESS_MS);
  window.addEventListener("pointermove", onLongPressMove);
  window.addEventListener("pointerup", clearLongPress);
  window.addEventListener("pointercancel", clearLongPress);
};

const beginDrag = (
  block: MergedBlock,
  event: PointerEvent,
  source: "grid" | "floating" | "embedded-conflict" = "grid"
) => {
  event.stopPropagation();
  if (event.cancelable) event.preventDefault();
  suppressCellClickUntil = Date.now() + 600;

  const sourceEl = event.target instanceof Element
    ? event.target.closest<HTMLElement>(".course-block")
    : null;
  dragSourceEl = sourceEl;
  dragPointerId = event.pointerId;
  try {
    sourceEl?.setPointerCapture(event.pointerId);
  } catch {
    dragPointerId = event.pointerId;
  }

  dragState.value = {
    scheduleId: block.schedule.id,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: 0,
    offsetY: 0,
    span: block.span,
    hasMoved: false,
    source
  };

  dropTarget.value = null;
  syncDragTrashState();
  window.addEventListener("pointermove", handlePointerMove, true);
  window.addEventListener("pointerup", handlePointerUp, true);
  window.addEventListener("pointercancel", cancelDrag, true);
};

const startEmbeddedConflictDrag = (block: MergedBlock, event: PointerEvent) => {
  if (event.button !== 0) return;

  const meta = getConflictMeta(block.schedule.id);
  if (meta.count <= 1 || displayedConflictGroupId.value) {
    return;
  }

  startDrag(block, event, "embedded-conflict");
};

const isBlockDragging = (scheduleId: number) => isDraggingSchedule(dragState.value, scheduleId);

const getBlockDragOffset = (scheduleId: number) => offsetForSchedule(dragState.value, scheduleId);

const dropPreviewFrame = computed<DropPreviewFrame | null>(() => {
  const target = dropTarget.value;
  const currentDrag = dragState.value;
  const body = bodyRef.value;
  if (!target || !currentDrag?.hasMoved || !body) return null;

  const cell = body.querySelector<HTMLElement>(`.cell[data-day="${target.day}"][data-period="${target.period}"]`);
  if (!cell) return null;

  const bodyRect = body.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  const rowHeight = cellRect.height;

  return {
    left: cellRect.left - bodyRect.left + body.scrollLeft + 2,
    top: cellRect.top - bodyRect.top + body.scrollTop + 2,
    width: Math.max(cellRect.width - 4, 0),
    height: Math.max(rowHeight * currentDrag.span - 4, rowHeight - 4),
    valid: target.valid
  };
});

/// A cell a spanning course only covers visually is still occupied. The coach must not
/// point "双击空白" at it.
const isCellCovered = (day: number, period: number) =>
  allBlocks.value.some(block =>
    block.schedule.dayOfWeek === day &&
    period >= block.startPeriod &&
    period <= block.endPeriod
  );

const handleWindowResize = () => {
  if (activeConflictGroup.value) {
    clearConflictOrbitImmediately();
  }
};

watch(activeConflictGroup, async (group) => {
  if (!group) {
    activeConflictLayout.value = null;
    return;
  }

  if (activeConflictLayout.value?.originFrames) {
    return;
  }
}, { flush: "post" });

watch(currentWeek, () => {
  clearConflictOrbitImmediately();
});

// Runs before the render that swaps the blocks in, so the flag is already up when they mount.
watch(currentWeek, (week, previousWeek) => {
  weekSlideDirection.value = week >= previousWeek ? 1 : -1;
  weekSwitching.value = true;
  if (weekSwitchTimer !== null) window.clearTimeout(weekSwitchTimer);
  weekSwitchTimer = window.setTimeout(() => {
    weekSwitching.value = false;
    weekSwitchTimer = null;
  }, WEEK_SWITCH_MS);
});

onMounted(() => {
  window.addEventListener("resize", handleWindowResize);
  window.addEventListener("click", handleGlobalClick, true);
});

onUnmounted(() => {
  if (weekSwitchTimer !== null) window.clearTimeout(weekSwitchTimer);
  clearOrbitAnimationTimer();
  clearLongPress();
  endDragGesture();
  window.removeEventListener("resize", handleWindowResize);
  window.removeEventListener("click", handleGlobalClick, true);
});
</script>

<template>
  <div
    class="week-grid"
    :class="[
      weekSwitching ? 'is-switching' : '',
      currentWeek % 2 ? 'week-odd' : 'week-even',
      dragState ? 'is-dragging-course' : ''
    ]"
    :style="weekGridStyle"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchEnd"
  >
    <div class="header">
      <div class="time-col"></div>
      <div
        v-for="(day, index) in days"
        :key="index"
        class="day-header"
        :class="{ 'is-today': todayDayNumber === index + 1 }"
      >
        <div class="day-pill">
          <span class="day-name">{{ day }}</span>
          <span v-if="weekDateLabels[index]" class="day-date">{{ weekDateLabels[index] }}</span>
        </div>
      </div>
    </div>

    <div ref="bodyRef" class="body">
      <template v-for="slot in periodSlots" :key="slot.period">
        <div
          class="period-row"
          :class="[
            `section-${slot.section}`,
            { 'big-session-end': isBigSessionEnd(slot.period) }
          ]"
        >
          <div class="time-col">
            <div class="period-number">{{ slot.period }}</div>
            <div class="period-time">{{ slot.time }}</div>
          </div>

          <div
            v-for="day in dayNumbers"
            :key="day"
            class="cell"
            :data-day="day"
            :data-period="slot.period"
            :data-coach-empty="isCellCovered(day, slot.period) ? undefined : 'true'"
            @click="handleCellClick(day, slot.period)"
          >
            <template v-for="block in getBlocksByDayAndPeriod(day, slot.period)" :key="`sch-${block.schedule.id}-c${block.course.id}`">
              <CourseBlock
                :course="block.course"
                :schedule="block.schedule"
                :span="block.span"
                :dividers="countDividersWithin(block.schedule.startPeriod, block.span)"
                :deleting="deletingId === block.schedule.id"
                :is-dragging="isBlockDragging(block.schedule.id)"
                :drag-offset="getBlockDragOffset(block.schedule.id)"
                :conflict-count="getConflictMeta(block.schedule.id).count"
                :conflict-index="getConflictMeta(block.schedule.id).index"
                :allow-drag="getConflictMeta(block.schedule.id).count === 1"
                :allow-expand="getConflictMeta(block.schedule.id).count === 1"
                @pointerdown.capture="startEmbeddedConflictDrag(block, $event)"
                @drag-start="startDrag(block, $event, 'grid')"
                @activate="openConflictGroupFromBlock(block, $event)"
              />
            </template>
          </div>
        </div>

        <div v-if="shouldShowDividerAfter(slot.period)" class="divider">
          <div class="divider-line"></div>
          <div class="divider-label">{{ getDividerLabel(slot.period) }}</div>
          <div class="divider-line"></div>
        </div>
      </template>

      <div
        v-if="dropPreviewFrame"
        class="drop-preview-block"
        :class="{ 'is-invalid': !dropPreviewFrame.valid }"
        :style="{
          left: `${dropPreviewFrame.left}px`,
          top: `${dropPreviewFrame.top}px`,
          width: `${dropPreviewFrame.width}px`,
          height: `${dropPreviewFrame.height}px`
        }"
      />

      <div
        v-if="activeConflictGroup && activeConflictLayout"
        class="conflict-orbit-layer"
        :class="`is-${orbitPhase}`"
        :style="{ height: `${activeConflictLayout.contentHeight}px` }"
      >
        <svg class="conflict-orbit-lines" :viewBox="`0 0 ${activeConflictLayout.boundaryWidth} ${activeConflictLayout.contentHeight}`" preserveAspectRatio="none">
          <line
            v-for="(block, index) in activeConflictGroup.blocks"
            :key="`line-${block.schedule.id}`"
            v-bind="getFloatingLine(block, index, activeConflictGroup.blocks.length) || {}"
            class="orbit-line"
            :class="{
              'is-opening': orbitPhase === 'opening',
              'is-closing': orbitPhase === 'closing'
            }"
            :style="getOrbitLineStyle(block, index, activeConflictGroup.blocks.length)"
          />
        </svg>
        <button
          type="button"
          class="conflict-orbit-center"
          :class="{
            'is-disabled': !!dragState,
            'is-opening': orbitPhase === 'opening',
            'is-closing': orbitPhase === 'closing'
          }"
          :style="{
            left: `${activeConflictLayout.centerX}px`,
            top: `${activeConflictLayout.centerY}px`
          }"
          aria-label="收回冲突课程"
          title="收回冲突课程"
          @click.stop="closeConflictGroup"
        />

        <CourseBlock
          v-for="(block, index) in activeConflictGroup.blocks"
          :key="`orbit-${block.schedule.id}`"
          class="orbit-card"
          :class="{
            'orbit-card-pop': orbitPhase === 'opening',
            'orbit-card-retract': orbitPhase === 'closing'
          }"
          :course="block.course"
          :schedule="block.schedule"
          :span="block.span"
          :floating-frame="getFloatingFrame(block, index, activeConflictGroup.blocks.length) || undefined"
          :style="getOrbitMotionStyle(block, index, activeConflictGroup.blocks.length)"
          :is-dragging="isBlockDragging(block.schedule.id)"
          :drag-offset="getBlockDragOffset(block.schedule.id)"
          :conflict-count="activeConflictGroup.blocks.length"
          :show-conflict-tag="false"
          :allow-drag="!isBlockDragging(block.schedule.id)"
          @drag-start="startDrag(block, $event, 'floating')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.week-grid {
  --time-col-width: 44px;
  /* Height of one class period. .period-row uses it as its minimum and CourseBlock
     multiplies it by its span, so grid rows and blocks stay in lockstep. */
  --row-height: 50px;
  /* Vertical space a 午休 / 晚饭 divider occupies between two rows. Blocks that span
     across one have to add it, otherwise they fall short. */
  --divider-height: 24px;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-width: max(100%, var(--week-grid-min-width));
  background: transparent;
  border-radius: 0;
  overflow: hidden;
  touch-action: pan-y;
}

.week-grid.is-dragging-course .course-block:not(.is-dragging) {
  pointer-events: none;
}

.header {
  display: grid;
  grid-template-columns: var(--time-col-width) repeat(7, minmax(0, 1fr));
  background: color-mix(in srgb, var(--theme-header-bg) 86%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 60%, transparent);
  position: sticky;
  overflow: hidden;
  top: 0;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
}

.time-col {
  padding: 5px 1px;
  text-align: center;
  font-size: 11px;
  color: var(--theme-body-text);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-right: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 20%, transparent);
  min-width: var(--time-col-width);
}

.day-header {
  padding: 5px 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--theme-header-text);
  border-right: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 20%, transparent);
  position: relative;
  overflow: hidden;
}

/* The name and the date sit in one rounded block so that today can be marked by filling the whole
   block, rather than by recolouring two lines of text or washing the header cell. */
.day-pill {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 4px 0 5px;
  border-radius: 10px;
}

.day-name {
  white-space: nowrap;
}

.day-date {
  font-size: 10px;
  font-weight: 500;
  opacity: 0.62;
  /* Tabular figures so the seven dates line up in a column instead of jittering. */
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Today, and only on the week that is actually current (see todayDayNumber): a rounded pill in the
   header. The body column is not washed. A tint that continues from the column up into the header
   cell clashes with the pill.
   The pill sits on the header band, so it uses that band's own pair, inverted (header-text fill,
   header-bg lettering): that pair is the one guaranteed to contrast *there*. The page accent is not:
   on the Vant preset the band is itself the accent blue, and a blue pill on a blue band was
   invisible. On every other preset header-text is the accent anyway. */
.day-header.is-today .day-pill {
  background: var(--theme-header-text);
  color: var(--theme-header-bg);
  font-weight: 800;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--theme-header-text) 30%, transparent);
  animation:
    today-pill-scale var(--dur-slow) var(--ease-spring) backwards,
    today-pill-fade var(--dur-fast) ease-out backwards;
}

.day-header.is-today .day-date {
  opacity: 0.88;
  font-weight: 700;
}

/* Pops in when the week on screen becomes the real one (jumping back with 回到本周, or the first
   paint). Scale and fade are separate animations so the spring cannot flicker the opacity. */
@keyframes today-pill-scale {
  from { transform: scale(0.82); }
  to { transform: scale(1); }
}

@keyframes today-pill-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.day-header:last-child {
  border-right: none;
}

.body {
  position: relative;
  flex: 1;
  /* Without this the flex item refuses to shrink below its content height (the default
     for a flex item is min-height: auto). It then grows past .week-grid, which has
     overflow: hidden, so the rows past the fold are clipped and cannot be reached --
     the timetable simply does not scroll. */
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 20px;
}

.period-row {
  display: grid;
  grid-template-columns: var(--time-col-width) repeat(7, minmax(0, 1fr));
  /* Single source of truth for the row height. CourseBlock reads the same variable for
     its own height, so the blocks and the grid can no longer drift apart. */
  min-height: var(--row-height);
}

.period-row.section-morning .time-col,
.period-row.section-morning .cell {
  background: color-mix(in srgb, #ffd166 4%, transparent);
}

.period-row.section-afternoon .time-col,
.period-row.section-afternoon .cell {
  background: color-mix(in srgb, #4dabf7 4%, transparent);
}

.period-row.section-evening .time-col,
.period-row.section-evening .cell {
  background: color-mix(in srgb, #6c5ce7 5%, transparent);
}

.period-row.big-session-end .cell,
.period-row.big-session-end .time-col {
  border-bottom: 2px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
}

.period-number {
  font-size: 13px;
  font-weight: 700;
  color: var(--theme-body-text);
  opacity: 0.8;
}

.period-time {
  font-size: 9px;
  color: var(--theme-body-text);
  opacity: 0.5;
  margin-top: 2px;
}

.cell {
  padding: 1px;
  border-right: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 20%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 20%, transparent);
  position: relative;
}

/* Body cells are not washed for today. The rounded header pill is the only live-day mark. */

.cell:last-child {
  border-right: none;
}

.drop-preview-block {
  position: absolute;
  z-index: 24;
  pointer-events: none;
  border-radius: var(--theme-card-border-radius);
  border: 2px solid color-mix(in srgb, var(--theme-card-border-color) 78%, transparent);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-card-border-color) 18%, transparent),
      color-mix(in srgb, var(--theme-card-border-color) 7%, transparent)
    );
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, #ffffff 34%, transparent),
    0 8px 20px color-mix(in srgb, var(--theme-card-border-color) 18%, transparent);
}

.drop-preview-block.is-invalid {
  border-color: color-mix(in srgb, #ee0a24 78%, transparent);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, #ee0a24 20%, transparent),
      color-mix(in srgb, #ee0a24 8%, transparent)
    );
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, #ffffff 28%, transparent),
    0 8px 20px rgba(238, 10, 36, 0.16);
}

.conflict-orbit-layer {
  position: absolute;
  inset: 0 0 auto 0;
  pointer-events: none;
  z-index: 30;
}

.conflict-orbit-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.orbit-line {
  stroke: color-mix(in srgb, #ff976a 84%, var(--theme-grid-line-color));
  stroke-width: 1.6;
  stroke-linecap: round;
  opacity: 0.85;
  transform-origin: center;
}

.orbit-line.is-opening,
.orbit-line.is-closing {
  stroke-dasharray: var(--orbit-line-length);
  animation-delay: var(--orbit-delay);
  animation-fill-mode: both;
}

.orbit-line.is-opening {
  animation: orbit-line-cast 0.38s cubic-bezier(0.2, 0.88, 0.28, 1.12);
}

.orbit-line.is-closing {
  animation: orbit-line-retract 0.24s cubic-bezier(0.4, 0, 0.7, 1);
}

.conflict-orbit-center {
  position: absolute;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 2px solid color-mix(in srgb, #ff976a 80%, var(--theme-card-border-color));
  border-radius: 999px;
  background:
    radial-gradient(circle at 50% 50%, #ffffff 0 2px, transparent 3px),
    color-mix(in srgb, var(--theme-bg-color) 88%, #ff976a 12%);
  box-shadow:
    0 0 0 4px color-mix(in srgb, #ff976a 16%, transparent),
    0 6px 16px rgba(0, 0, 0, 0.16);
  cursor: pointer;
  pointer-events: auto;
  transform: translate(-50%, -50%);
}

.conflict-orbit-center:hover {
  background:
    radial-gradient(circle at 50% 50%, #ffffff 0 2px, transparent 3px),
    color-mix(in srgb, var(--theme-bg-color) 78%, #ff976a 22%);
}

.conflict-orbit-center.is-opening {
  animation: orbit-knot-pulse 0.42s cubic-bezier(0.2, 0.82, 0.26, 1.08);
}

.conflict-orbit-center.is-closing {
  animation: orbit-knot-pull 0.22s ease-in;
}

.conflict-orbit-center.is-disabled {
  pointer-events: none;
}

.orbit-card {
  pointer-events: auto;
  transform-origin: center center;
  will-change: transform, opacity;
}

.orbit-card-pop {
  animation: orbit-pop 0.44s cubic-bezier(0.16, 0.92, 0.24, 1.08);
  animation-delay: var(--orbit-delay);
  animation-fill-mode: both;
}

.orbit-card-retract {
  animation: orbit-retract 0.28s cubic-bezier(0.48, 0.02, 0.74, 1);
  animation-fill-mode: both;
}

@keyframes orbit-pop {
  0% {
    opacity: 0;
    transform: translate(calc(var(--orbit-dx) * -0.84), calc(var(--orbit-dy) * -0.84)) scale(0.9) rotate(calc(var(--orbit-twist) * -1deg));
  }

  60% {
    opacity: 1;
    transform: translate(calc(var(--orbit-dx) * 0.1), calc(var(--orbit-dy) * 0.1)) scale(1.02) rotate(calc(var(--orbit-twist) * 0.45deg));
  }

  100% {
    opacity: 1;
    transform: translate(0, 0) scale(1) rotate(0deg);
  }
}

@keyframes orbit-retract {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1) rotate(0deg);
  }

  18% {
    opacity: 1;
    transform: translate(calc(var(--orbit-dx) * 0.06), calc(var(--orbit-dy) * 0.06)) scale(1.02) rotate(calc(var(--orbit-twist) * 0.2deg));
  }

  100% {
    opacity: 0;
    transform: translate(calc(var(--orbit-dx) * -0.92), calc(var(--orbit-dy) * -0.92)) scale(0.82) rotate(calc(var(--orbit-twist) * -0.7deg));
  }
}

@keyframes orbit-line-cast {
  0% {
    opacity: 0;
    stroke-dashoffset: var(--orbit-line-length);
  }

  100% {
    opacity: 0.85;
    stroke-dashoffset: 0;
  }
}

@keyframes orbit-line-retract {
  0% {
    opacity: 0.85;
    stroke-dashoffset: 0;
  }

  100% {
    opacity: 0;
    stroke-dashoffset: calc(var(--orbit-line-length) * -0.9);
  }
}

@keyframes orbit-knot-pulse {
  0% {
    transform: translate(-50%, -50%) scale(0.82);
    box-shadow:
      0 0 0 0 color-mix(in srgb, #ff976a 24%, transparent),
      0 0 0 rgba(0, 0, 0, 0);
  }

  60% {
    transform: translate(-50%, -50%) scale(1.14);
    box-shadow:
      0 0 0 8px color-mix(in srgb, #ff976a 10%, transparent),
      0 8px 18px rgba(0, 0, 0, 0.2);
  }

  100% {
    transform: translate(-50%, -50%) scale(1);
    box-shadow:
      0 0 0 4px color-mix(in srgb, #ff976a 16%, transparent),
      0 6px 16px rgba(0, 0, 0, 0.16);
  }
}

@keyframes orbit-knot-pull {
  0% {
    transform: translate(-50%, -50%) scale(1);
  }

  100% {
    transform: translate(-50%, -50%) scale(0.84);
  }
}

.divider {
  display: flex;
  align-items: center;
  /* A declared height rather than one derived from padding (8px 12px used to make it 29px
     by accident). CourseBlock adds exactly this much when a block spans across a divider,
     so the value has to be something both sides can name. */
  height: var(--divider-height);
  padding: 0 12px;
  gap: 8px;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: var(--theme-grid-line-color);
  opacity: 0.2;
}

/* One character on its own looks lost between two long rules, so it gets a small capsule to sit in. */
.divider-label {
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  color: var(--theme-body-text);
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  opacity: 0.7;
  white-space: nowrap;
}

/* ---------- Week change ----------
   The week's content slides in a few px from the side the new week lies on. Two identical keyframe
   sets under different names, picked by the week's parity: swapping the animation-name is what makes
   the browser start it again, so no script has to restart it. Transform and opacity only. */
.week-grid.is-switching.week-odd .body,
.week-grid.is-switching.week-odd .day-date {
  animation: week-in-a var(--dur-base) var(--ease-smooth) both;
}

.week-grid.is-switching.week-even .body,
.week-grid.is-switching.week-even .day-date {
  animation: week-in-b var(--dur-base) var(--ease-smooth) both;
}

@keyframes week-in-a {
  from { opacity: 0; transform: translate3d(calc(var(--week-dir, 1) * 14px), 0, 0); }
  to { opacity: 1; transform: none; }
}

@keyframes week-in-b {
  from { opacity: 0; transform: translate3d(calc(var(--week-dir, 1) * 14px), 0, 0); }
  to { opacity: 1; transform: none; }
}

/* The blocks pop in when they appear (see CourseBlock). While the whole week is sliding in they must
   not, or half of them would pop and half would not, depending on which ones the two weeks share.
   A near-zero duration rather than animation: none, because switching the name back afterwards
   would restart the animation on every block. */
.week-grid.is-switching {
  --block-pop-dur: 0.01ms;
}
</style>
