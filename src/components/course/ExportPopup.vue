<script setup lang="ts">
import { ref, computed } from "vue";
import { showToast } from "vant";
import { useCourses } from "@/composables/useCourses";
import { useTheme } from "@/composables/useTheme";
import { Copy, X, Share2, Info, CalendarDays, Database } from '@lucide/vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

const { exportToCsv, currentWeek } = useCourses();
const { cssVariables } = useTheme();

const exportMode = ref<"current-week" | "semester-base">("current-week");

const exportData = computed(() => {
  if (exportMode.value === "semester-base") {
    return exportToCsv("semester-base");
  }
  return exportToCsv("current-week");
});

const modeDescription = computed(() => {
  if (exportMode.value === "semester-base") {
    return "导出学期基础课表（CSV 格式），不包含按周临时调整。";
  }
  return `导出第 ${currentWeek.value} 周当前实际生效的课表（CSV 格式）。`;
});

const copyData = async () => {
  try {
    await navigator.clipboard.writeText(exportData.value);
    showToast({ message: "导出数据已复制", type: "success" });
  } catch (e) {
    showToast({ message: "复制失败", type: "fail" });
  }
};
</script>

<template>
  <van-popup
    :show="props.show"
    @update:show="val => emit('update:show', val)"
    round
    position="center"
    class="app-popup app-popup--center"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.2)' }"
  >
    <div class="app-popup-card">
      <button class="app-popup-close" aria-label="关闭" @click="emit('update:show', false)">
        <X :size="16" />
      </button>

      <h2 class="app-popup-title">
        <Share2 :size="18" />
        导出课表数据
      </h2>

      <div class="info-banner">
        <Info :size="14" class="info-icon" />
        <span>{{ modeDescription }}</span>
      </div>

      <div class="export-mode-selector">
        <button
          class="mode-option"
          :class="{ active: exportMode === 'current-week' }"
          @click="exportMode = 'current-week'"
        >
          <CalendarDays :size="14" />
          <span>本周 CSV</span>
        </button>
        <button
          class="mode-option"
          :class="{ active: exportMode === 'semester-base' }"
          @click="exportMode = 'semester-base'"
        >
          <Database :size="14" />
          <span>学期 CSV</span>
        </button>
      </div>

      <div class="data-preview">
        <pre>{{ exportData }}</pre>
      </div>

      <button class="app-btn app-btn--primary export-copy" @click="copyData">
        <Copy :size="18" />
        一键复制 CSV
      </button>
    </div>
  </van-popup>
</template>

<style scoped>
.info-banner {
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.4;
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  opacity: 0.85;
}

.info-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--theme-body-text);
}

.export-mode-selector {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.mode-option {
  min-width: 0;
  height: 38px;
  border: none;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  background: color-mix(in srgb, var(--theme-body-text) 6%, transparent);
  color: var(--theme-body-text);
  transition:
    transform var(--dur-base) var(--ease-spring),
    background-color var(--dur-fast) ease-out,
    color var(--dur-fast) ease-out;
}

/* The accent, not header-bg / header-text: on the minimal themes those two are the popup's own
   background, so the selected mode did not stand out at all. */
.mode-option.active {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}

.data-preview {
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
  background: color-mix(in srgb, var(--theme-bg-color), var(--theme-body-text) 5%);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  border-radius: 12px;
}

.data-preview pre {
  margin: 0;
  font-size: 11px;
  opacity: 0.6;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
}

.export-copy {
  margin-top: 16px;
}

.data-preview::-webkit-scrollbar { width: 4px; }
.data-preview::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--theme-body-text) 20%, transparent);
  border-radius: 2px;
}
</style>
