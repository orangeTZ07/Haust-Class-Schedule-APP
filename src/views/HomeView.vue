<script setup lang="ts">
import { ref } from "vue";
import { useTheme } from "@/composables/useTheme";
import { useCourses } from "@/composables/useCourses";
import TopBar from "@/components/layout/TopBar.vue";
import SideBar from "@/components/layout/SideBar.vue";
import WeekGrid from "@/components/timetable/WeekGrid.vue";
import ImportPopup from "@/components/course/ImportPopup.vue";
import ExportPopup from "@/components/course/ExportPopup.vue";
import ContactPopup from "@/components/layout/ContactPopup.vue";

const { cssVariables, themeConfig } = useTheme();
const { courses, clearAll, importFromJson, currentWeek, semesterWeekCount, setCurrentWeek } = useCourses();

const sidebarVisible = ref(false);
const importVisible = ref(false);
const exportVisible = ref(false);
const contactVisible = ref(false);
const trashTargetState = ref({
  visible: false,
  active: false
});

const toggleSidebar = () => {
  sidebarVisible.value = !sidebarVisible.value;
};

const closeSidebar = () => {
  sidebarVisible.value = false;
};

const handleSidebarAction = (action: string) => {
  if (action === "import") {
    importVisible.value = true;
  } else if (action === "export") {
    exportVisible.value = true;
  } else if (action === "contact") {
    contactVisible.value = true;
  }
  console.log("Sidebar action:", action);
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

      <div class="grid-container">
        <WeekGrid @drag-trash-state-change="handleDragTrashStateChange" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-view {
  position: relative;
  height: 100vh;
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
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.content-layer.pushed {
  transform: translateX(280px);
}

.grid-container {
  flex: 1;
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
