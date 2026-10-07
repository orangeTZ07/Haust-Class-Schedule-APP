<script setup lang="ts">
import type { Component } from "vue";
import { useRouter } from "vue-router";
import { CalendarRange, CircleHelp, Settings, Upload, Download, Users } from '@lucide/vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  /// How far the drawer is out, from 0 to width. The drawer and the dimming overlay both read it,
  /// so a drag moves the whole thing as one piece instead of snapping a class on and off.
  offset?: number;
  /// True while a finger is down. Suppresses transitions so nothing lags behind the finger.
  dragging?: boolean;
  width?: number;
}>(), {
  offset: 0,
  dragging: false,
  width: 280
});

const emit = defineEmits<{
  close: [];
  action: [action: string];
}>();

const router = useRouter();

/// An entry either opens a page (`route`) or asks the home view to do something (`action`).
interface MenuItem {
  icon: Component;
  label: string;
  route?: string;
  action?: string;
  coach?: string;
}

/// Grouped so the drawer reads as clean sections rather than one long list. The 样式调整 entry
/// now lives under 设置, and the duplicate 导入 entry was dropped.
const groups: { title: string; items: MenuItem[] }[] = [
  {
    title: "课表",
    items: [
      { icon: Download, label: "导入课表", action: "import", coach: "import" },
      { icon: Upload, label: "导出课表", action: "export" },
      { icon: CalendarRange, label: "选择课程表", route: "/tables" },
    ]
  },
];

/// Pinned to the bottom of the drawer, away from the everyday actions above.
/// 「设置」is last so it is the bottom-most row.
const footerItems: MenuItem[] = [
  { icon: CircleHelp, label: "操作指南", action: "coach" },
  { icon: Users, label: "联系开发者", action: "contact" },
  { icon: Settings, label: "设置", route: "/settings", coach: "settings" },
];

const handleItemClick = (item: MenuItem) => {
  if (item.route) {
    router.push(item.route);
    emit("close");
  } else if (item.action) {
    // The home view closes the drawer itself once it has handled the action.
    emit("action", item.action);
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
      :class="{ visible: offset > 0, 'is-dragging': dragging }"
      :style="{ opacity: Math.min(offset / width, 1) }"
      @click="handleOverlayClick"
    />

    <!-- 侧边栏 -->
    <div
      class="sidebar"
      :class="{ visible, 'is-dragging': dragging }"
      :style="{ width: `${width}px`, transform: `translateX(${offset - width}px)` }"
    >
      <div class="sidebar-header">
        <span class="app-title">Haust课程表</span>
      </div>

      <div class="menu-list">
        <div v-for="group in groups" :key="group.title" class="menu-group">
          <div class="group-title">{{ group.title }}</div>
          <div
            v-for="item in group.items"
            :key="item.label"
            class="menu-item"
            :data-coach="item.coach"
            @click="handleItemClick(item)"
          >
            <component :is="item.icon" :size="20" />
            <span class="menu-label">{{ item.label }}</span>
          </div>
        </div>
      </div>

      <div class="menu-footer">
        <div
          v-for="item in footerItems"
          :key="item.label"
          class="menu-item"
          :data-coach="item.coach"
          @click="handleItemClick(item)"
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
  /* No backdrop blur here. The overlay's opacity is rewritten on every touchmove while the drawer is
     dragged, and re-blurring a full-screen layer each frame for a 2px blur nobody could see was the
     most expensive thing on this screen. */
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  visibility: hidden;
  /* Same duration and easing as .content-layer in HomeView: the drawer and the page behind it
     have to settle together, or the two halves of the same motion look disconnected. */
  transition:
    opacity var(--dur-base) var(--ease-smooth),
    visibility var(--dur-base) linear;
  z-index: 101;
}

.overlay.visible {
  opacity: 1;
  visibility: visible;
  transition-duration: var(--dur-slow);
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
  will-change: transform;
  transition: transform var(--dur-base) var(--ease-smooth);
  z-index: 102;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
  border-right: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 30%, transparent);
}

.sidebar.visible {
  transform: translateX(0);
  transition-duration: var(--dur-slow);
}

/* While the finger is down the offset is written on every move; a transition on top of that makes
   both the drawer and the overlay chase the finger rather than sit under it. */
.sidebar.is-dragging,
.overlay.is-dragging {
  transition: none;
}

.sidebar-header {
  position: relative;
  padding: 24px 20px;
  padding-top: calc(24px + var(--safe-top));
  /* The drawer slides in from the left edge, so in landscape that is the side a cutout can be on. */
  padding-left: calc(20px + var(--safe-left));
  /* The same band colour as the top bar. The title is header-text, which is only guaranteed to be
     readable on header-bg: on the Vant blue preset it is white, and on the bare drawer background
     it vanished. */
  background: color-mix(in srgb, var(--theme-header-bg) 85%, transparent);
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
  padding-left: calc(10px + var(--safe-left));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.menu-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-title {
  padding: 0 14px 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--theme-body-text);
  opacity: 0.45;
}

/* Settings and contact stay put at the bottom whatever the height, clear of the gesture bar. */
.menu-footer {
  padding: 8px 10px;
  padding-bottom: calc(8px + var(--safe-bottom));
  padding-left: calc(10px + var(--safe-left));
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-top: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  cursor: pointer;
  color: var(--theme-body-text);
  border-radius: 10px;
  transition:
    transform var(--dur-base) var(--ease-spring),
    background-color var(--dur-fast) ease-out;
}

/* Hover only where there is a pointer: on touch :hover sticks after a tap, which left the last
   tapped entry nudged sideways until the next touch. */
@media (hover: hover) {
  .menu-item:hover {
    background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
    transform: translateX(4px);
  }
}

.menu-item:active {
  background: color-mix(in srgb, var(--theme-body-text) 12%, transparent);
  transform: scale(var(--press-scale));
  transition-duration: 90ms, var(--dur-fast);
  transition-timing-function: ease-out;
}

.menu-label {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
}

</style>
