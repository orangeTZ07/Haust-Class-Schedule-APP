<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronDown, Menu, Trash2 } from "@lucide/vue";

const props = defineProps<{
  showTrashTarget?: boolean;
  trashTargetActive?: boolean;
  currentWeek: number;
  totalWeeks: number;
}>();

const emit = defineEmits<{
  toggleSidebar: [];
  changeWeek: [week: number];
}>();

const topBarRef = ref<HTMLElement | null>(null);
const weekPickerOpen = ref(false);

const weekOptions = computed(() => {
  return Array.from({ length: props.totalWeeks }, (_, index) => index + 1);
});

const handleToggle = () => {
  emit("toggleSidebar");
};

const changeWeek = (week: number) => {
  emit("changeWeek", week);
  weekPickerOpen.value = false;
};

const toggleWeekPicker = () => {
  weekPickerOpen.value = !weekPickerOpen.value;
};

const handleDocumentClick = (event: MouseEvent) => {
  if (!weekPickerOpen.value) return;
  if (event.target instanceof Node && topBarRef.value?.contains(event.target)) return;
  weekPickerOpen.value = false;
};

watch(() => props.showTrashTarget, (visible) => {
  if (visible) {
    weekPickerOpen.value = false;
  }
});

onMounted(() => {
  document.addEventListener("click", handleDocumentClick, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick, true);
});
</script>

<template>
  <div ref="topBarRef" class="top-bar" :class="{ 'is-trash-visible': showTrashTarget }">
    <div class="left">
      <div class="menu-btn" @click="handleToggle">
        <Menu :size="22" />
      </div>
      <span class="title">课程表</span>
    </div>

    <div class="week-switcher" aria-label="切换周目">
      <button type="button" class="week-label" :class="{ active: weekPickerOpen }" @click="toggleWeekPicker">
        第 {{ currentWeek }} 周
        <ChevronDown :size="14" class="week-label-icon" :class="{ active: weekPickerOpen }" />
      </button>

      <transition name="week-picker">
        <div v-if="weekPickerOpen" class="week-picker-popover">
          <button
            v-for="week in weekOptions"
            :key="week"
            type="button"
            class="week-option"
            :class="{ active: week === currentWeek }"
            @click="changeWeek(week)"
          >
            第 {{ week }} 周
          </button>
        </div>
      </transition>
    </div>

    <div
      v-if="showTrashTarget"
      class="trash-target"
      :class="{ 'is-active': trashTargetActive }"
      data-trash-target="schedule-delete"
      aria-label="拖到这里删除课段"
    >
      <Trash2 :size="18" />
    </div>
  </div>
</template>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  background: color-mix(in srgb, var(--theme-header-bg) 85%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 50%, transparent);
  position: sticky;
  top: 0;
  z-index: 50;
  transition: background-color 0.3s ease;
}

.top-bar.is-trash-visible {
  z-index: 260;
}

.left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-btn {
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  color: var(--theme-header-text);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.menu-btn:hover {
  background: color-mix(in srgb, var(--theme-header-text) 10%, transparent);
  transform: scale(1.05);
}

.menu-btn:active {
  transform: scale(0.95);
}

.title {
  font-size: 18px;
  font-weight: 700;
  color: var(--theme-header-text);
}

.week-switcher {
  position: absolute;
  left: 50%;
  top: calc(12px + env(safe-area-inset-top, 0px));
  transform: translateX(-50%);
  height: 34px;
  display: flex;
  align-items: center;
}

.week-label {
  min-width: 0;
  height: 30px;
  border: none;
  border-radius: 7px;
  color: var(--theme-header-text);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  background: transparent;
  cursor: pointer;
}

.week-label.active {
  background: color-mix(in srgb, var(--theme-header-text) 8%, transparent);
}

.week-label-icon {
  opacity: 0.7;
  transition: transform 0.16s ease;
}

.week-label-icon.active {
  transform: rotate(180deg);
}

.week-picker-popover {
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  transform: translateX(-50%);
  width: min(260px, calc(100vw - 32px));
  max-height: 260px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 42%, transparent);
  background: color-mix(in srgb, var(--theme-bg-color) 92%, transparent);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.week-option {
  min-width: 0;
  height: 34px;
  border: none;
  border-radius: 7px;
  background: color-mix(in srgb, var(--theme-body-text) 6%, transparent);
  color: var(--theme-body-text);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.week-option.active {
  background: var(--theme-header-bg);
  color: var(--theme-header-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-header-text) 14%, transparent);
}

.week-picker-enter-active,
.week-picker-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.week-picker-enter-from,
.week-picker-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-4px);
}

.trash-target {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
  background: color-mix(in srgb, var(--theme-header-bg) 74%, transparent);
  color: color-mix(in srgb, var(--theme-header-text) 82%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition:
    transform 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;
}

.trash-target.is-active {
  transform: scale(1.05);
  color: #ee0a24;
  border-color: color-mix(in srgb, #ee0a24 68%, transparent);
  background: color-mix(in srgb, #ee0a24 14%, var(--theme-header-bg));
  box-shadow:
    0 0 0 4px color-mix(in srgb, #ee0a24 10%, transparent),
    0 8px 18px rgba(238, 10, 36, 0.16);
}
</style>
