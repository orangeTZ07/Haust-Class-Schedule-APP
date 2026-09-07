<script setup lang="ts">
import { ref } from "vue";
import { useCourses } from "@/composables/useCourses";
import { useTheme } from "@/composables/useTheme";

const {
  periodConfig
} = useCourses();

const { themeConfig, isDark } = useTheme();

const showPicker = ref(false);
const currentKey = ref<string>("");
const currentTime = ref<string[]>([]);

const openPicker = (key: 'morningStart' | 'afternoonStart' | 'eveningStart') => {
  currentKey.value = key;
  currentTime.value = (periodConfig.value[key] || "08:00").split(":");
  showPicker.value = true;
};

const onConfirm = ({ selectedValues }: any) => {
  const timeStr = selectedValues.join(":");
  (periodConfig.value as any)[currentKey.value] = timeStr;
  showPicker.value = false;
};

const resetToDefaults = () => {
  periodConfig.value = {
    morningStart: "08:00",
    afternoonStart: "14:00",
    eveningStart: "19:00",
    periodDuration: 45,
    breakDuration: 10,
    longBreakDuration: 20,
    morningPeriods: 4,
    afternoonPeriods: 4,
    eveningPeriods: 2
  };
};
</script>

<template>
  <div class="grid-settings">
    <div class="header-row">
      <div class="section-title">课程节数</div>
      <van-button 
        size="small" 
        round 
        class="reset-btn"
        @click="resetToDefaults"
      >
        恢复默认
      </van-button>
    </div>

    <div class="section">
      <div class="config-item">
        <span class="label">上午节数</span>
        <van-stepper v-model="periodConfig.morningPeriods" :min="1" :max="8" integer theme="round" button-size="22" />
      </div>
      <div class="config-item">
        <span class="label">下午节数</span>
        <van-stepper v-model="periodConfig.afternoonPeriods" :min="1" :max="8" integer theme="round" button-size="22" />
      </div>
      <div class="config-item">
        <span class="label">晚课节数</span>
        <van-stepper v-model="periodConfig.eveningPeriods" :min="0" :max="6" integer theme="round" button-size="22" />
      </div>
    </div>

    <div class="section">
      <div class="section-title">时间细节</div>
      <div class="config-item">
        <span class="label">每节时长</span>
        <div class="input-group">
          <van-stepper v-model="periodConfig.periodDuration" :min="30" :max="120" :step="5" integer theme="round" button-size="22" />
          <span class="unit">min</span>
        </div>
      </div>
      <div class="config-item">
        <span class="label">小课间</span>
        <div class="input-group">
          <van-stepper v-model="periodConfig.breakDuration" :min="0" :max="30" :step="5" integer theme="round" button-size="22" />
          <span class="unit">min</span>
        </div>
      </div>
      <div class="config-item">
        <span class="label">大课间</span>
        <div class="input-group">
          <van-stepper v-model="periodConfig.longBreakDuration" :min="0" :max="60" :step="5" integer theme="round" button-size="22" />
          <span class="unit">min</span>
        </div>
      </div>

      <div class="config-item clickable" @click="openPicker('morningStart')">
        <span class="label">上午开始</span>
        <div class="time-value">
          {{ periodConfig.morningStart }}
        </div>
      </div>

      <div class="config-item clickable" @click="openPicker('afternoonStart')">
        <span class="label">下午开始</span>
        <div class="time-value">
          {{ periodConfig.afternoonStart }}
        </div>
      </div>

      <div class="config-item clickable" @click="openPicker('eveningStart')">
        <span class="label">晚课开始</span>
        <div class="time-value">
          {{ periodConfig.eveningStart }}
        </div>
      </div>
    </div>

    <van-popup v-model:show="showPicker" position="bottom" round>
      <van-time-picker
        v-model="currentTime"
        title="选择时间"
        @confirm="onConfirm"
        @cancel="showPicker = false"
      />
    </van-popup>
  </div>
</template>

<style scoped>
.grid-settings {
  padding: 12px 16px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.reset-btn {
  height: 24px;
  padding: 0 10px;
  font-size: 11px;
  background: var(--theme-header-bg); /* Fallback */
  background: color-mix(in srgb, var(--theme-header-bg) 10%, transparent);
  border: 1px solid var(--theme-grid-line-color); /* Fallback */
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
  color: var(--theme-header-text);
}

.section {
  margin-bottom: 24px;
  background: var(--theme-grid-line-color); /* Fallback */
  background: color-mix(in srgb, var(--theme-grid-line-color) 15%, transparent);
  border: 1px solid var(--theme-grid-line-color); /* Fallback */
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 30%, transparent);
  border-radius: var(--theme-card-border-radius);
  overflow: hidden;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--theme-body-text);
  opacity: 0.6;
  padding: 14px 16px 6px;
}

.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 20%, transparent);
  transition: all 0.2s ease;
}

.config-item:last-child {
  border-bottom: none;
}

.clickable {
  cursor: pointer;
}

.clickable:active {
  background: color-mix(in srgb, var(--theme-header-bg) 5%, transparent);
}

.label {
  font-size: 14px;
  color: var(--theme-body-text);
  font-weight: 500;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.unit {
  font-size: 11px;
  color: var(--theme-body-text);
  opacity: 0.4;
  font-style: italic;
}

.time-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--theme-header-text);
  font-family: 'Monaco', 'Courier New', monospace;
  padding: 4px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-header-bg) 8%, transparent);
}

/* 适配 Vant 组件的主题色偏移 */
:deep(.van-stepper__plus), :deep(.van-stepper__minus) {
  background-color: color-mix(in srgb, var(--theme-header-bg) 15%, transparent) !important;
  color: var(--theme-header-text) !important;
  border: none !important; /* 移除可能的默认边框 */
  opacity: 1 !important;
}

:deep(.van-stepper__minus--disabled), :deep(.van-stepper__plus--disabled) {
  opacity: 0.3 !important;
}

:deep(.van-stepper__input) {
  background-color: transparent !important;
  color: var(--theme-body-text) !important;
  font-weight: 600;
  margin: 0 4px !important;
}

:deep(.van-picker) {
  background-color: var(--theme-bg-color) !important;
}

:deep(.van-picker__mask) {
  background-image: none !important; /* 彻底去掉白色渐变遮罩 */
}

:deep(.van-picker__hairline) {
  border-top: 1px solid color-mix(in srgb, var(--theme-primary-color, #1989fa) 30%, transparent) !important;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-primary-color, #1989fa) 30%, transparent) !important;
  background-color: color-mix(in srgb, var(--theme-primary-color, #1989fa) 5%, transparent);
}

:deep(.van-picker__toolbar) {
  border-bottom: 1px solid var(--theme-grid-line-color);
  background-color: var(--theme-bg-color) !important;
}

:deep(.van-picker-column__item) {
  color: var(--theme-body-text) !important;
  opacity: 0.4;
}

:deep(.van-picker-column__item--selected) {
  color: var(--theme-primary-color, #1989fa) !important;
  opacity: 1;
  font-weight: 700;
}

:deep(.van-picker__title) {
  color: var(--theme-body-text) !important;
}
</style>