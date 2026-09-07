<script setup lang="ts">
import { ref, computed } from "vue";
import { showToast } from "vant";
import { useCourses } from "@/composables/useCourses";
import { useTheme } from "@/composables/useTheme";
import { Copy, X, Share2, Info, CalendarDays, Database, FileJson } from '@lucide/vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

const { exportToCsv, exportToJsonBackup, currentWeek } = useCourses();
const { cssVariables, isDark } = useTheme();

const exportMode = ref<"current-week" | "semester-base" | "json-backup">("current-week");

const exportData = computed(() => {
  if (exportMode.value === "semester-base") {
    return exportToCsv("semester-base");
  }
  if (exportMode.value === "json-backup") {
    return exportToJsonBackup();
  }
  return exportToCsv("current-week");
});

const modeDescription = computed(() => {
  if (exportMode.value === "semester-base") {
    return "导出学期基础课表，不包含按周覆盖层。";
  }
  if (exportMode.value === "json-backup") {
    return "导出当前课表的完整备份，包含基础课表和按周覆盖层。";
  }
  return `导出第 ${currentWeek.value} 周当前实际生效的课表。`;
});

const copyLabel = computed(() => exportMode.value === "json-backup" ? "一键复制 JSON" : "一键复制 CSV");

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
    class="custom-export-popup"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.2)' }"
  >
    <div class="minimal-export-card" :class="{ 'is-dark': isDark }">
      <button class="minimal-close-btn haptics" @click="emit('update:show', false)">
        <X :size="16" />
      </button>

      <div class="card-title">
        <Share2 :size="18" style="margin-right: 8px;" />
        导出课表数据
      </div>
      
      <div class="card-sections">
        <div class="info-banner">
          <Info :size="14" class="info-icon" />
          <span>{{ modeDescription }}</span>
        </div>

        <div class="export-mode-selector">
          <button
            class="mode-option haptics"
            :class="{ active: exportMode === 'current-week' }"
            @click="exportMode = 'current-week'"
          >
            <CalendarDays :size="14" />
            <span>本周 CSV</span>
          </button>
          <button
            class="mode-option haptics"
            :class="{ active: exportMode === 'semester-base' }"
            @click="exportMode = 'semester-base'"
          >
            <Database :size="14" />
            <span>学期 CSV</span>
          </button>
          <button
            class="mode-option haptics"
            :class="{ active: exportMode === 'json-backup' }"
            @click="exportMode = 'json-backup'"
          >
            <FileJson :size="14" />
            <span>完整 JSON</span>
          </button>
        </div>

        <div class="main-step">
          <div class="inset-box data-preview">
            <pre>{{ exportData }}</pre>
          </div>
        </div>
      </div>

      <div class="minimal-actions">
        <button class="minimal-primary-btn haptics" @click="copyData">
          <Copy :size="18" style="margin-right: 8px;" />
          {{ copyLabel }}
        </button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.custom-export-popup {
  width: 85%;
  max-width: 340px;
  background: color-mix(in srgb, var(--theme-bg-color) 85%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.minimal-export-card { padding: 32px 20px 20px; color: var(--theme-body-text); }

.minimal-close-btn {
  position: absolute; top: 12px; right: 12px; width: 24px; height: 24px; border-radius: 6px; border: none;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  color: var(--theme-body-text); opacity: 0.6;
}

.card-title { 
  font-size: 17px; 
  font-weight: 600; 
  margin-bottom: 20px; 
  color: var(--theme-header-text);
  display: flex;
  align-items: center;
}

.info-banner {
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.4;
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  opacity: 0.8;
}

.info-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--theme-body-text);
}

.export-mode-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}

.mode-option {
  min-width: 0;
  height: 38px;
  border: none;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  background: color-mix(in srgb, var(--theme-body-text) 6%, transparent);
  color: var(--theme-body-text);
}

.mode-option.active {
  background: var(--theme-header-bg);
  color: var(--theme-header-text);
}

.inset-box {
  background: color-mix(in srgb, var(--theme-bg-color), var(--theme-body-text) 5%);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  border-radius: 10px;
  overflow: hidden;
}

.data-preview { 
  padding: 12px; 
  max-height: 200px;
  overflow-y: auto;
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

.minimal-actions { margin-top: 24px; }

.minimal-primary-btn {
  width: 100%; height: 44px; border-radius: 10px; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center;
  background: var(--theme-header-bg); color: var(--theme-header-text);
  border: 1px solid color-mix(in srgb, var(--theme-header-text) 10%, transparent);
}

.haptics:active { transform: scale(0.98); opacity: 0.8; }
.data-preview::-webkit-scrollbar { width: 4px; }
.data-preview::-webkit-scrollbar-thumb { 
  background: color-mix(in srgb, var(--theme-body-text) 20%, transparent);
  border-radius: 2px;
}
</style>
