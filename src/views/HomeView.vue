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
        periodSlots, addCourse, addSchedule } = useCourses();

const sidebarVisible = ref(false);
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
  sidebarVisible.value = !sidebarVisible.value;
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

const closeSidebar = () => {
  sidebarVisible.value = false;
};

const gridContainerRef = ref<HTMLElement | null>(null);
const weekGridRef = ref<{ resetView: () => void } | null>(null);

// Undo an accidental pinch-zoom or sideways pan. The grid width is pinch-driven and the
// horizontal offset lives on this component's container, so neither had a way back: they are
// easy to disturb by touch and were impossible to restore precisely.
const resetTimetableView = () => {
  weekGridRef.value?.resetView();
  if (gridContainerRef.value) gridContainerRef.value.scrollLeft = 0;
  showToast({ message: "课表视图已重置", type: "success" });
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
</script>

<template>
  <div class="home-view" :style="cssVariables">
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
    <div class="content-layer" :class="{ pushed: sidebarVisible }">
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
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.content-layer.pushed {
  transform: translateX(280px);
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
