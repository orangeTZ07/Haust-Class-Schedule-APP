<script setup lang="ts">
import { useRouter } from "vue-router";
import { CalendarRange, Settings, Upload, Download, Palette, Users, SquareCheckBig, BookMarked } from '@lucide/vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
  action: [action: string];
}>();

const router = useRouter();

const menuItems = [
  { icon: SquareCheckBig, label: "待办列表", action: "todo" },
  { icon: CalendarRange, label: "选择课程表", action: "tables" },
  { icon: Settings, label: "设置", action: "settings" },
  { icon: BookMarked, label: "自定义学习计划", action: "learning-plan" },
  { icon: Download, label: "导入课表", action: "import" },
  { icon: Upload, label: "导出课表", action: "export" },
  { icon: Palette, label: "样式调整", action: "style" },
  { icon: Users, label: "联系开发者", action: "contact" },
];

const handleItemClick = (action: string) => {
  if (action === "settings") {
    router.push("/settings");
    emit("close");
  } else if (action === "todo") {
    router.push("/todo");
    emit("close");
  } else if (action === "tables") {
    router.push("/tables");
    emit("close");
  } else if (action === "style") {
    router.push("/style");
    emit("close");
  } else if (action === "learning-plan") {
    router.push("/learning-plan");
    emit("close");
  } else if (action === "import" || action === "export" || action === "contact") {
    emit("action", action);
    emit("close");
  } else {
    emit("action", action);
  }
};

const handleOverlayClick = () => {
  emit("close");
};
</script>

<template>
  <div class="sidebar-wrapper">
    <!-- 遮罩层 -->
    <div
      class="overlay"
      :class="{ visible }"
      @click="handleOverlayClick"
    />

    <!-- 侧边栏 -->
    <div class="sidebar" :class="{ visible }">
      <div class="sidebar-header">
        <span class="app-title">课程表</span>
      </div>

      <div class="menu-list">
        <div
          v-for="item in menuItems"
          :key="item.action"
          class="menu-item"
          @click="handleItemClick(item.action)"
        >
          <component :is="item.icon" :size="20" />
          <span class="menu-label">{{ item.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar-wrapper {
  position: relative;
  z-index: 100;
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0.3s ease;
  z-index: 101;
}

.overlay.visible {
  opacity: 1;
  visibility: visible;
}

.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  background: color-mix(in srgb, var(--theme-bg-color) 85%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  transform: translateX(-100%);
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 102;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
  border-right: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 30%, transparent);
}

.sidebar.visible {
  transform: translateX(0);
}

.sidebar-header {
  padding: 24px 20px;
  padding-top: calc(24px + env(safe-area-inset-top, 0px));
  background: transparent;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
}

.app-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--theme-header-text);
}

.menu-list {
  flex: 1;
  padding: 12px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  cursor: pointer;
  color: var(--theme-body-text);
  border-radius: 10px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.menu-item:hover {
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  transform: translateX(4px);
}

.menu-item:active {
  background: color-mix(in srgb, var(--theme-body-text) 12%, transparent);
  transform: translateX(2px) scale(0.98);
}

.menu-label {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
}

.theme-indicator {
  opacity: 0.7;
}
</style>
