<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTheme } from "@/composables/useTheme";
import { useCourses } from "@/composables/useCourses";
import { useReminder } from "@/composables/useReminder";
import { showToast } from "vant";
import TopBar from "@/components/layout/TopBar.vue";
import SideBar from "@/components/layout/SideBar.vue";
import WeekGrid from "@/components/timetable/WeekGrid.vue";
import ImportPopup from "@/components/course/ImportPopup.vue";
import ExportPopup from "@/components/course/ExportPopup.vue";
import ContactPopup from "@/components/layout/ContactPopup.vue";
import CourseForm from "@/components/course/CourseForm.vue";

const { cssVariables, themeConfig } = useTheme();
const { courses, clearAll, importFromJson, currentWeek, semesterWeekCount, setCurrentWeek,
        periodSlots, addCourse, addSchedule, hasImportSnapshot, restoreImportSnapshot } = useCourses();

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
  active: false
});

// Reminders cover a rolling seven-day window rather than the whole semester, so the window is
// renewed every time the app opens. Failures are swallowed deliberately: not being able to
// schedule a reminder must never get in the way of using the timetable.
const { reschedule: rescheduleReminders } = useReminder();
onMounted(() => {
  rescheduleReminders().catch(() => {});
});

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
  addVisible.value = true;
};

const onAddSubmit = async (payload: {
  name: string;
  teacher?: string;
  location?: string;
  span: number;
}) => {
  const slot = addSlot.value;
  if (!slot) return;
  // endPeriod is inclusive here -- WeekGrid derives a block's span as end - start + 1.
  const endPeriod = slot.period + payload.span - 1;
  const course = await addCourse(payload.name, payload.teacher, payload.location);
  await addSchedule(course.id, slot.day, slot.period, endPeriod);
  addVisible.value = false;
  addSlot.value = null;
  showToast({ message: `已添加「${payload.name}」`, type: "success" });
};

/// Set when a drawer drag ends. A touch can still deliver a click on release, and if that click
/// lands on the overlay it would call closeSidebar and undo the gesture that just finished.
let ignoreCloseUntil = 0;

const closeSidebar = () => {
  if (Date.now() < ignoreCloseUntil) return;
  setSidebar(false);
};

const gridContainerRef = ref<HTMLElement | null>(null);
const weekGridRef = ref<{ resetView: () => boolean } | null>(null);

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

/// Puts the timetable data back to how it was right after the last import.
///
/// Kept separate from 重置课表视图 on purpose: that one only moves the view and is harmless, while
/// this discards everything added or edited since the import. One button cannot be both, and
/// hiding a destructive action behind the word "reset" is how people lose work.
const restoreImportedTimetable = async () => {
  if (!hasImportSnapshot.value) {
    showToast("还没有可恢复的导入记录，需要先导入一次课表");
    return;
  }
  if (!confirm("恢复到导入时的课表？导入之后新增、修改或删除的课程都会被覆盖，且无法撤销。")) {
    return;
  }

  const result = await restoreImportSnapshot();
  showToast({ message: result.message, type: result.success ? "success" : "fail" });
};

const handleSidebarAction = async (action: string) => {
  if (action === "import") {
    importVisible.value = true;
  } else if (action === "export") {
    exportVisible.value = true;
  } else if (action === "contact") {
    contactVisible.value = true;
  } else if (action === "reset-view") {
    resetTimetableView();
  } else if (action === "restore-import") {
    await restoreImportedTimetable();
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
    alert(result.message);
  }
  closeSidebar();
};

const handleClear = () => {
  if (confirm("确定清空所有课程？")) {
    clearAll();
  }
  closeSidebar();
};

const handleDragTrashStateChange = (state: { visible: boolean; active: boolean }) => {
  trashTargetState.value = state;
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

    <!-- 侧边栏 -->
    <SideBar
      :visible="sidebarVisible"
      :offset="sidebarOffset"
      :dragging="sidebarDragging"
      :width="SIDEBAR_WIDTH"
      @close="closeSidebar"
      @action="handleSidebarAction"
    />

    <!-- 导入弹窗 -->
    <ImportPopup v-model:show="importVisible" />

    <!-- 导出弹窗 -->
    <ExportPopup v-model:show="exportVisible" />

    <!-- 联系开发者弹窗 -->
    <ContactPopup v-model:show="contactVisible" />

    <!-- 点空格子添加课程 -->
    <CourseForm
      v-model:show="addVisible"
      :day="addSlot?.day ?? 1"
      :period="addSlot?.period ?? 1"
      :max-period="lastPeriod"
      @submit="onAddSubmit"
    />

    <!-- 内容层 -->
    <div
      class="content-layer"
      :class="{ 'is-dragging': sidebarDragging }"
      :style="{ transform: `translateX(${sidebarOffset}px)` }"
    >
      <TopBar
        :show-trash-target="trashTargetState.visible"
        :trash-target-active="trashTargetState.active"
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
        />
      </div>
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
  padding-bottom: env(safe-area-inset-bottom, 0px);
  /* Promoted so the per-frame transform during a drag stays on the compositor. */
  will-change: transform;
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
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
