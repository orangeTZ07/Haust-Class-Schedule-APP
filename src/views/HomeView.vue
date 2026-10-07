<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useTheme } from "@/composables/useTheme";
import { useCourses } from "@/composables/useCourses";
import { useReminder } from "@/composables/useReminder";
import { showToast } from "vant";
import { confirmAction } from "@/utils/confirm";
import {
  isCourseBlockDeferred,
  isEmptyCellDeferred,
  isSettingsCoachTarget,
  readSeenStepIds,
  rememberCourseBlockUnanchored,
  rememberEmptyCellUnanchored,
  SETTINGS_COACH_PATH,
  timetableFingerprint
} from "@/utils/featureCoach";
import { useFeatureCoach } from "@/composables/useFeatureCoach";
import {
  markReimportPrompted,
  semesterNeedsReimport,
  wasReimportPrompted,
  WEEK_OFFSET_PROMPT
} from "@/utils/weekOffsetPrompt";
import TopBar from "@/components/layout/TopBar.vue";
import SideBar from "@/components/layout/SideBar.vue";
import WeekGrid from "@/components/timetable/WeekGrid.vue";
import ImportSheet from "@/components/course/import/ImportSheet.vue";
import ExportPopup from "@/components/course/ExportPopup.vue";
import ContactPopup from "@/components/layout/ContactPopup.vue";
import CourseForm, { type CourseFormSubmitPayload } from "@/components/course/CourseForm.vue";
import DeleteScopeDialog from "@/components/course/DeleteScopeDialog.vue";
import EditModeBar from "@/components/edit/EditModeBar.vue";
import FeatureCoach from "@/components/coach/FeatureCoach.vue";
import type { DeleteScopePayload } from "@/utils/scheduleDelete";

const router = useRouter();
const { cssVariables, themeConfig } = useTheme();
const {
  coachMode,
  coachStep,
  coachPhase,
  coachIsLast,
  startAutoCoach: startAutoCoachQueue,
  startManualCoach,
  dismissCoach,
  advanceCoach,
  followCoachCue: setCueSpotlight,
  dropCurrentStep
} = useFeatureCoach();
const { courses, clearAll, importFromJson, currentWeek, semesterWeekCount, setCurrentWeek,
        periodSlots, addCourse, addSchedule, schedules, effectiveSchedules, activeCourseTableId,
        coursesReady, editing, sessionCount, canUndoEdit, canRedoEdit,
        commitEdit, undoEdit, redoEdit, exitEditMode, removeScheduleInScope, updateOccurrenceInScope, getCourseById } = useCourses();
const SIDEBAR_WIDTH = 280;
const sidebarVisible = ref(false);
/// How far the drawer is out, in px, from 0 (closed) to SIDEBAR_WIDTH (open). While a finger is
/// down this is the drag position; on release it settles to one end.
const sidebarOffset = ref(0);
/// Suppresses the transition while dragging, so the drawer tracks the finger instead of lagging.
const sidebarDragging = ref(false);
const importVisible = ref(false);
const exportVisible = ref(false);
const contactVisible = ref(false);
const trashTargetState = ref({
  visible: false,
  active: false,
  gearActive: false
});
const courseFormMode = ref<"add" | "edit">("add");
const editSlot = ref<{
  scheduleId: number;
  day: number;
  period: number;
  name: string;
  teacher: string;
  location: string;
  span: number;
} | null>(null);

// Reminders cover a rolling seven-day window rather than the whole semester, so the window is
// renewed every time the home screen opens. useReminder also renews it by itself when the
// timetable changes or the app comes back to the foreground. This is debounced and swallows its
// own failures: not being able to schedule a reminder must never get in the way of using the
// timetable.
const { refreshReminders } = useReminder();
const onEditKey = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || !editing.value) return;
  exitEditMode();
};

const toggleSidebar = () => {
  setSidebar(!sidebarVisible.value);
};

// Adding a course: WeekGrid reports the tapped empty slot, the form collects the rest.
const addSlot = ref<{ day: number; period: number } | null>(null);
const addVisible = ref(false);
const lastPeriod = computed(() =>
  periodSlots.value.length ? periodSlots.value[periodSlots.value.length - 1].period : 10
);

const onRequestAdd = (slot: { day: number; period: number }) => {
  addSlot.value = slot;
  courseFormMode.value = "add";
  editSlot.value = null;
  addVisible.value = true;
};

const onCourseFormSubmit = async (payload: CourseFormSubmitPayload) => {
  if (courseFormMode.value === "edit") {
    await onEditSubmit(payload);
    return;
  }
  const slot = addSlot.value;
  if (!slot) return;
  // endPeriod is inclusive here -- WeekGrid derives a block's span as end - start + 1.
  const endPeriod = slot.period + payload.span - 1;
  const course = await addCourse(payload.name, payload.teacher, payload.location);

  const scheduleOptions = payload.weekScope === "current"
    ? {
        startWeek: currentWeek.value,
        endWeek: currentWeek.value,
        weekType: "all" as const,
        scope: "weekly" as const
      }
    : payload.weekScope === "custom"
      ? {
          startWeek: payload.startWeek ?? 1,
          endWeek: payload.endWeek ?? semesterWeekCount.value,
          weekType: payload.weekType ?? ("all" as const),
          scope: "semester" as const
        }
      : {
          startWeek: 1,
          endWeek: semesterWeekCount.value,
          weekType: "all" as const,
          scope: "semester" as const
        };

  await addSchedule(course.id, slot.day, slot.period, endPeriod, scheduleOptions);
  commitEdit();
  addVisible.value = false;
  addSlot.value = null;
  const scopeDesc = payload.weekScope === "current" ? `（第 ${currentWeek.value} 周）` : "";
  showToast({ message: `已添加「${payload.name}」${scopeDesc}`, type: "success" });
};

const onRequestEdit = (payload: { scheduleId: number }) => {
  const schedule = schedules.value.find(item => item.id === payload.scheduleId)
    ?? effectiveSchedules.value.find(item => item.id === payload.scheduleId);
  if (!schedule) return;
  const course = getCourseById(schedule.courseId);
  editSlot.value = {
    scheduleId: schedule.id,
    day: schedule.dayOfWeek,
    period: schedule.startPeriod,
    name: course?.name ?? "",
    teacher: course?.teacher ?? "",
    location: course?.location ?? "",
    span: schedule.endPeriod - schedule.startPeriod + 1
  };
  courseFormMode.value = "edit";
  addVisible.value = true;
};

const onEditSubmit = async (payload: CourseFormSubmitPayload) => {
  const slot = editSlot.value;
  if (!slot) return;
  addVisible.value = false;
  const changed = await updateOccurrenceInScope(slot.scheduleId, {
    ...payload,
    weekScope: payload.weekScope,
    startWeek: payload.startWeek,
    endWeek: payload.endWeek,
    weekType: payload.weekType
  });
  editSlot.value = null;
  courseFormMode.value = "add";
  if (changed) {
    commitEdit();
    showToast({ message: `已更新「${payload.name}」`, type: "success" });
  }
};

const deleteSlot = ref<{ scheduleId: number; day: number; period: number; courseName: string } | null>(null);
const deleteVisible = ref(false);

const onRequestDelete = (payload: { scheduleId: number }) => {
  const schedule = schedules.value.find(item => item.id === payload.scheduleId)
    ?? effectiveSchedules.value.find(item => item.id === payload.scheduleId);
  if (!schedule) return;
  const course = getCourseById(schedule.courseId);
  deleteSlot.value = {
    scheduleId: payload.scheduleId,
    day: schedule.dayOfWeek,
    period: schedule.startPeriod,
    courseName: course?.name ?? ""
  };
  deleteVisible.value = true;
};

const onDeleteSubmit = async (payload: DeleteScopePayload) => {
  const slot = deleteSlot.value;
  if (!slot) return;
  deleteVisible.value = false;
  await weekGridRef.value?.playDeleteAnimation?.(slot.scheduleId);
  const removed = await removeScheduleInScope(slot.scheduleId, payload);
  deleteSlot.value = null;
  if (removed) {
    commitEdit();
    showToast("已删除课段");
  }
};

/// Set when a drawer drag ends. A touch can still deliver a click on release, and if that click
/// lands on the overlay it would call closeSidebar and undo the gesture that just finished.
let ignoreCloseUntil = 0;

const closeSidebar = () => {
  if (Date.now() < ignoreCloseUntil) return;
  setSidebar(false);
};

const gridContainerRef = ref<HTMLElement | null>(null);
const weekGridRef = ref<{ resetView: () => boolean; playDeleteAnimation?: (id: number) => Promise<void> } | null>(null);

// Undo an accidental pinch-zoom or sideways pan. The grid width is pinch-driven and the horizontal
// offset lives on this component's container, so neither had a way back: they are easy to disturb
// by touch and were impossible to restore precisely.
//
// It reports what it found rather than always announcing a reset. "Nothing to reset" and "the
// button is dead" look identical otherwise, and the button did appear dead -- for a different
// reason, a suppressed click, which made this even harder to read from the outside.
const resetTimetableView = () => {
  // resetView reports the pinch zoom and the timetable's own vertical/horizontal scroll; the outer
  // container has its own horizontal offset, checked here.
  const wasMoved = weekGridRef.value?.resetView() ?? false;
  const wasScrolledOuter = (gridContainerRef.value?.scrollLeft ?? 0) !== 0;
  if (gridContainerRef.value) gridContainerRef.value.scrollLeft = 0;
  showToast({
    message: wasMoved || wasScrolledOuter ? "课表视图已重置" : "课表视图已是默认状态",
    type: wasMoved || wasScrolledOuter ? "success" : "text"
  });
};

const handleSidebarAction = (action: string) => {
  if (action === "import") {
    importVisible.value = true;
  } else if (action === "export") {
    exportVisible.value = true;
  } else if (action === "contact") {
    contactVisible.value = true;
  } else if (action === "reset-view") {
    resetTimetableView();
  } else if (action === "coach") {
    startManualCoach();
  }
  closeSidebar();
};

const sampleJson = `[
  { "name": "高等数学", "day": 1, "periods": "1-2", "loc": "A101", "teacher": "张三" },
  { "name": "大学英语", "day": 2, "periods": "3-4", "loc": "B203" },
  { "name": "程序设计", "day": 3, "periods": "1-2", "loc": "C305", "teacher": "李四" },
  { "name": "线性代数", "day": 4, "periods": "3-4", "loc": "A201" },
  { "name": "体育", "day": 5, "periods": "5-6", "loc": "操场" }
]`;

const loadSample = async () => {
  const result = await importFromJson(sampleJson);
  if (result.success) {
    showToast(result.message);
  }
  closeSidebar();
};

const handleClear = async () => {
  closeSidebar();
  const confirmed = await confirmAction({
    title: "清空所有课程？",
    message: "课程和课段都会被删除，此操作无法撤销。",
    confirmText: "清空",
    danger: true,
  });
  if (confirmed) clearAll();
};

const handleDragTrashStateChange = (state: { visible: boolean; active: boolean; gearActive?: boolean }) => {
  trashTargetState.value = {
    visible: state.visible,
    active: state.active,
    gearActive: state.gearActive ?? false
  };
};

// Swiping in from the left edge opens the sidebar, and swiping back closes it again. The menu
// button still works; this is a second way in, not a replacement.
//
// The drawer is driven by an offset rather than a boolean so it can follow the finger: the
// sidebar, the dimming overlay and the content layer all read the same number, and a drag simply
// moves it. A boolean can only ever snap between two states, which is what made the first version
// feel stiff.
/// Where a swipe may begin, measured from the left edge.
///
/// The lower bound is the one that matters: a touch starting closer to the edge than this lands in
/// the strip Android's own back gesture owns under gesture navigation, and the system takes the
/// gesture before the webview sees anything -- which is what made the drawer feel unreliable and,
/// worse, sometimes triggered back instead. An earlier revision accepted anything within 40px of
/// the edge, i.e. exactly that contested strip. The upper bound keeps this an edge gesture rather
/// than a swipe from anywhere.
const SWIPE_START_MIN_PX = 56;
const SWIPE_START_MAX_PX = 180;
const DRAG_DECISION_RATIO = 0.4;
/// px per ms. Past this the gesture is treated as a flick and wins over how far it travelled.
const FLING_VELOCITY = 0.35;
/// Movement below this is not yet enough to tell a horizontal drag from a vertical one. Kept small
/// so the drawer starts moving almost at once rather than after a visible dead zone.
const DIRECTION_THRESHOLD_PX = 4;
/// How far left a finger must travel before a drag counts as closing an open drawer. Larger than
/// the threshold above on purpose: see the note in onEdgeTouchMove.
const CLOSE_DRAG_MIN_PX = 12;

interface DragState {
  x: number;
  y: number;
  at: number;
  baseOffset: number;
  horizontal: boolean | null;
}

let dragState: DragState | null = null;

const setSidebar = (open: boolean) => {
  sidebarVisible.value = open;
  sidebarOffset.value = open ? SIDEBAR_WIDTH : 0;
};

const bootstrapped = ref(false);
let promptingReimport = false;

const coachFingerprint = computed(() => timetableFingerprint(activeCourseTableId.value, schedules.value));

const syncCoachChrome = () => {
  const step = coachStep.value;
  if (!step) return;
  if (step.target === "import" && coachPhase.value === "spotlight") setSidebar(true);
  else setSidebar(false);
};

/// Auto tour. Does not include a deferred step, and does not mark that step seen.
const startAutoCoach = () => {
  if (coachMode.value || importVisible.value) return;
  startAutoCoachQueue({
    seenIds: readSeenStepIds(localStorage),
    hasCoursesOnCurrentWeek: effectiveSchedules.value.length > 0,
    deferEmptyCell: isEmptyCellDeferred(currentWeek.value, coachFingerprint.value),
    deferCourseBlock: isCourseBlockDeferred(currentWeek.value, coachFingerprint.value)
  });
  syncCoachChrome();
};

const finishCoachOnHome = () => {
  const wasAuto = coachMode.value === "auto";
  dismissCoach(false);
  setSidebar(false);
  if (wasAuto) startAutoCoach();
};

const advanceCoachOnHome = () => {
  advanceCoach(false);
  syncCoachChrome();
};

const followCoachCue = () => {
  setCueSpotlight();
  const step = coachStep.value;
  if (step && isSettingsCoachTarget(step.target)) {
    setSidebar(false);
    router.push(SETTINGS_COACH_PATH);
    return;
  }
  syncCoachChrome();
};

const onCoachUnanchored = () => {
  if (coachStep.value?.target === "empty-cell") {
    rememberEmptyCellUnanchored(currentWeek.value, coachFingerprint.value);
  }
  if (coachStep.value?.target === "course-block") {
    rememberCourseBlockUnanchored(currentWeek.value, coachFingerprint.value);
  }
  dropCurrentStep();
  syncCoachChrome();
};

const considerReimportPrompt = async (): Promise<boolean> => {
  const tableId = activeCourseTableId.value;
  if (promptingReimport || wasReimportPrompted(tableId, localStorage)) return false;
  if (!semesterNeedsReimport(schedules.value)) return false;
  promptingReimport = true;
  try {
    const go = await confirmAction({
      title: WEEK_OFFSET_PROMPT.title,
      message: WEEK_OFFSET_PROMPT.message,
      confirmText: WEEK_OFFSET_PROMPT.confirmText,
      cancelText: WEEK_OFFSET_PROMPT.cancelText
    });
    markReimportPrompted(tableId, localStorage);
    return go;
  } finally {
    promptingReimport = false;
  }
};

onMounted(async () => {
  document.addEventListener("keydown", onEditKey);
  refreshReminders();
  await coursesReady;
  const openImport = await considerReimportPrompt();
  bootstrapped.value = true;
  if (openImport) importVisible.value = true;
  else if (coachMode.value) {
    if (isSettingsCoachTarget(coachStep.value?.target)) coachPhase.value = "cue";
    syncCoachChrome();
  } else {
    startAutoCoach();
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onEditKey);
});

watch(importVisible, (open) => {
  if (!open && bootstrapped.value) startAutoCoach();
});

watch(effectiveSchedules, () => {
  if (!bootstrapped.value) return;
  startAutoCoach();
});

/// Flipping week must re-run auto coach even when this week's courses look the same as
/// last week's: the empty-cell step was deferred for that week, and a new week may have
/// a free cell. effectiveSchedules above covers data edits; this covers the week itself.
watch(currentWeek, () => {
  if (!bootstrapped.value) return;
  startAutoCoach();
});

watch(activeCourseTableId, async () => {
  if (!bootstrapped.value) return;
  if (await considerReimportPrompt()) importVisible.value = true;
});

watch(sidebarVisible, (open) => {
  const step = coachStep.value;
  if (!step?.offHome || isSettingsCoachTarget(step.target)) return;
  coachPhase.value = open ? "spotlight" : "cue";
});

const onEdgeTouchStart = (event: TouchEvent) => {
  const touch = event.touches[0];
  if (!touch) return;

  // Two fingers is a pinch on the timetable, not a drawer gesture. Claiming it would call
  // preventDefault and break the zoom.
  if (event.touches.length > 1) {
    dragState = null;
    return;
  }

  // Open: a drag anywhere may close it again, which is what makes the swipe reversible.
  if (sidebarVisible.value) {
    dragState = { x: touch.clientX, y: touch.clientY, at: Date.now(), baseOffset: SIDEBAR_WIDTH, horizontal: null };
    return;
  }

  // Closed: the drag has to begin inside the band, not merely somewhere near the edge.
  if (touch.clientX < SWIPE_START_MIN_PX || touch.clientX > SWIPE_START_MAX_PX) {
    dragState = null;
    return;
  }

  // A touch landing on a course is the user grabbing that course, not reaching for the drawer. The
  // swipe band overlaps the first day column, so without this a long-press drag near the left edge
  // moved the drawer at the same time as the course.
  if (event.target instanceof Element && event.target.closest(".course-block")) {
    dragState = null;
    return;
  }

  dragState = { x: touch.clientX, y: touch.clientY, at: Date.now(), baseOffset: 0, horizontal: null };
};

const onEdgeTouchMove = (event: TouchEvent) => {
  const state = dragState;
  if (!state) return;

  // A second finger means a pinch; hand the gesture to the zoom.
  if (event.touches.length > 1) {
    dragState = null;
    return;
  }

  const touch = event.touches[0];
  if (!touch) return;

  const dx = touch.clientX - state.x;
  const dy = touch.clientY - state.y;

  // Decide once, and only once, whether this gesture belongs to the drawer. Until then the event
  // is left alone so the timetable keeps scrolling normally.
  if (state.horizontal === null) {
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < DIRECTION_THRESHOLD_PX && ady < DIRECTION_THRESHOLD_PX) return;

    // Vertical leads outright: the user is scrolling the timetable, so leave the event alone.
    if (ady > adx) {
      dragState = null;
      return;
    }

    if (sidebarVisible.value) {
      // Closing takes a deliberate leftward drag. Claiming any horizontal jitter here was a
      // regression: claiming calls preventDefault on touchmove, and that suppresses the click a tap
      // would otherwise produce -- so taps on the menu items, 重置课表视图 among them, stopped
      // registering at all.
      if (dx > -CLOSE_DRAG_MIN_PX) {
        dragState = null;
        return;
      }
      // Re-anchor where the gesture was recognised, so the drawer carries on from where it already
      // is instead of jumping by however far the finger travelled first.
      state.x = touch.clientX;
      state.y = touch.clientY;
      state.baseOffset = sidebarOffset.value;
    } else if (dx <= 0) {
      // Closed: only a rightward drag opens. A leftward one is left to the browser rather than
      // claiming a gesture that was never going to open anything.
      dragState = null;
      return;
    }

    state.horizontal = true;
    sidebarDragging.value = true;
  }

  // Cancelling the default only after claiming the gesture, so a vertical scroll is untouched.
  if (event.cancelable) event.preventDefault();

  // Re-read from state.x rather than reusing dx: the open case re-anchors above.
  const liveDx = touch.clientX - state.x;
  sidebarOffset.value = Math.min(Math.max(state.baseOffset + liveDx, 0), SIDEBAR_WIDTH);
};

const onEdgeTouchEnd = () => {
  const state = dragState;
  dragState = null;
  if (!state || state.horizontal !== true) return;

  ignoreCloseUntil = Date.now() + 300;

  const offset = sidebarOffset.value;
  const elapsed = Math.max(Date.now() - state.at, 1);
  const velocity = (offset - state.baseOffset) / elapsed;

  const shouldOpen = velocity > FLING_VELOCITY
    ? true
    : velocity < -FLING_VELOCITY
      ? false
      : offset >= SIDEBAR_WIDTH * DRAG_DECISION_RATIO;

  sidebarVisible.value = shouldOpen;
  // The transition has to be restored before the offset moves, or the drawer jumps instead of
  // settling. Holding the offset for one frame gives the animation a value to ease away from.
  sidebarDragging.value = false;
  requestAnimationFrame(() => {
    sidebarOffset.value = shouldOpen ? SIDEBAR_WIDTH : 0;
  });
};
</script>

<template>
  <div
    class="home-view"
    :style="cssVariables"
    @touchstart.passive="onEdgeTouchStart"
    @touchmove="onEdgeTouchMove"
    @touchend="onEdgeTouchEnd"
    @touchcancel="onEdgeTouchEnd"
  >
    <!-- 背景层 -->
    <div
      class="bg-layer"
      :style="{
        backgroundColor: themeConfig.bgColor
      }"
    />
    <div
      v-if="themeConfig.bgImage"
      class="bg-image-layer"
      :style="{
        backgroundImage: `url(${themeConfig.bgImage})`,
        opacity: themeConfig.bgImageOpacity / 100,
        filter: `blur(${themeConfig.bgBlur}px)`,
        transform: themeConfig.bgBlur > 0 ? 'scale(1.1)' : 'none'
      }"
    />

    <FeatureCoach
      :step="coachStep"
      :phase="coachPhase"
      :is-last="coachIsLast"
      @next="advanceCoachOnHome"
      @skip="finishCoachOnHome"
      @close="finishCoachOnHome"
      @follow-cue="followCoachCue"
      @unanchored="onCoachUnanchored"
    />

    <!-- 侧边栏 -->
    <SideBar
      :visible="sidebarVisible"
      :offset="sidebarOffset"
      :dragging="sidebarDragging"
      :width="SIDEBAR_WIDTH"
      @close="closeSidebar"
      @action="handleSidebarAction"
    />

    <!-- 导入面板：教务系统同步 / AI 识别 -->
    <ImportSheet v-model:show="importVisible" />

    <!-- 导出弹窗 -->
    <ExportPopup v-model:show="exportVisible" />

    <!-- 联系开发者弹窗 -->
    <ContactPopup v-model:show="contactVisible" />

    <!-- 点空格子添加课程 -->
    <CourseForm
      v-model:show="addVisible"
      :mode="courseFormMode"
      :day="(courseFormMode === 'edit' ? editSlot?.day : addSlot?.day) ?? 1"
      :period="(courseFormMode === 'edit' ? editSlot?.period : addSlot?.period) ?? 1"
      :current-week="currentWeek"
      :total-weeks="semesterWeekCount"
      :max-period="lastPeriod"
      :initial-name="editSlot?.name ?? ''"
      :initial-teacher="editSlot?.teacher ?? ''"
      :initial-location="editSlot?.location ?? ''"
      :initial-span="editSlot?.span ?? 1"
      @submit="onCourseFormSubmit"
    />

    <!-- 拖到垃圾桶后选择删除范围 -->
    <DeleteScopeDialog
      v-model:show="deleteVisible"
      :day="deleteSlot?.day ?? 1"
      :period="deleteSlot?.period ?? 1"
      :course-name="deleteSlot?.courseName ?? ''"
      :current-week="currentWeek"
      :total-weeks="semesterWeekCount"
      @submit="onDeleteSubmit"
    />

    <!-- 内容层 -->
    <div
      class="content-layer"
      :class="{ 'is-dragging': sidebarDragging, 'is-open': sidebarVisible }"
      :style="{ transform: `translateX(${sidebarOffset}px)` }"
    >
      <TopBar
        :show-trash-target="trashTargetState.visible"
        :trash-target-active="trashTargetState.active"
        :gear-target-active="trashTargetState.gearActive"
        :current-week="currentWeek"
        :total-weeks="semesterWeekCount"
        @toggle-sidebar="toggleSidebar"
        @change-week="setCurrentWeek"
      />

      <div ref="gridContainerRef" class="grid-container">
        <WeekGrid
          ref="weekGridRef"
          @drag-trash-state-change="handleDragTrashStateChange"
          @request-add="onRequestAdd"
          @request-delete="onRequestDelete"
          @request-edit="onRequestEdit"
        />
      </div>

      <EditModeBar
        v-if="editing"
        :can-undo="canUndoEdit"
        :can-redo="canRedoEdit"
        :count="sessionCount"
        @undo="undoEdit"
        @redo="redoEdit"
        @exit="exitEditMode"
      />
    </div>
  </div>
</template>

<style scoped>
.home-view {
  position: relative;
  /* 100dvh tracks the *visible* viewport. With viewport-fit=cover, 100vh on Android
     extends under the gesture bar / navigation bar, so the last row of the grid sat
     below the reachable area. The vh line stays as a fallback for older WebViews. */
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

.bg-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
}

.bg-image-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  z-index: 1;
}

.content-layer {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  height: 100%;
  /* Keeps the grid clear of the gesture bar. Applied on the content layer rather than on
     .home-view so the background layers still bleed to the true screen edge. Every other
     view in this app already handled its safe-area insets; this screen did not, even
     though it is the one users spend their time on. */
  padding-bottom: var(--safe-bottom);
  /* Promoted so the per-frame transform during a drag stays on the compositor. */
  will-change: transform;
  /* The drawer is a big surface: smooth, no overshoot, and the way back (the base rule) is quicker
     than the way out. SideBar uses the same pair so drawer, overlay and page settle together. */
  transition: transform var(--dur-base) var(--ease-smooth);
}

.content-layer.is-open {
  transition-duration: var(--dur-slow);
}

/* While the finger is down the offset is written every move; a transition on top of that makes
   the layer chase the finger instead of sitting under it. */
.content-layer.is-dragging {
  transition: none;
}

.grid-container {
  flex: 1;
  /* Same reason as .body in WeekGrid.vue: a flex item defaults to min-height: auto, so it
     would grow to its content height instead of letting the timetable scroll inside it.
     overflow-y stays hidden because .body is the vertical scroller. */
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  /* Landscape only: keeps the first and last column out from under a cutout. The top bar and the
     bottom padding above already clear the other two edges. */
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
  scrollbar-width: thin;
}

.grid-container::-webkit-scrollbar {
  height: 6px;
}

.grid-container::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--theme-grid-line-color) 55%, transparent);
  border-radius: 999px;
}
</style>
