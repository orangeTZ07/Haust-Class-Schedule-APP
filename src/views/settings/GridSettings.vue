<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useCourses } from "@/composables/useCourses";
import { useTheme } from "@/composables/useTheme";
import { useReminder } from "@/composables/useReminder";
import { checkBatteryOptimization, openBatterySettings } from "@/services/reminderService";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";

const {
  periodConfig,
  semesterStartDate,
  setSemesterStartDate
} = useCourses();

/// Bound through a change handler rather than v-model so the stored value stays exactly the
/// "YYYY-MM-DD" the input produces; useCourses parses it from parts to dodge the UTC-midnight
/// shift a bare date string would otherwise get.
const onSemesterStartChange = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  if (value) setSemesterStartDate(value);
};

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

const { prefs: reminderPrefs, reminderSupported, maxMinutesBefore, reschedule } = useReminder();

const reminderBusy = ref(false);
const reminderMessage = ref("");
const batteryExempt = ref(true);

const refreshBatteryState = async () => {
  if (!reminderSupported) return;
  batteryExempt.value = await checkBatteryOptimization();
};

onMounted(refreshBatteryState);

/// Called after the switch flips, so reminderPrefs already holds the new value.
///
/// The notification permission is requested before anything is scheduled: on Android 13+ the
/// alarm would otherwise fire into a notification the system drops, and the feature would look
/// broken rather than unpermitted.
const onToggleReminder = async () => {
  if (reminderBusy.value) return;
  reminderBusy.value = true;
  try {
    if (reminderPrefs.value.enabled) {
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === "granted";
      }
      if (!granted) {
        reminderPrefs.value.enabled = false;
        reminderMessage.value = "未获得通知权限，系统会丢弃提醒。请在系统设置中允许通知后重试。";
        return;
      }
    }
    await applyReminders();
  } catch (e) {
    reminderMessage.value = `设置提醒失败：${(e as Error).message}`;
  } finally {
    reminderBusy.value = false;
  }
};

/// Also used when the lead time changes: the trigger times are computed from it, so every alarm
/// in the window has to be rewritten.
const applyReminders = async () => {
  const result = await reschedule();
  if (!result.supported) {
    reminderMessage.value = "当前平台不支持上课提醒（仅 Android）。";
    return;
  }
  reminderMessage.value = reminderPrefs.value.enabled
    ? `已为未来 7 天注册 ${result.scheduled} 个提醒`
    : `已关闭，并取消 ${result.cancelled} 个提醒`;
  await refreshBatteryState();
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
      <div class="section-title">学期日期</div>
      <div class="config-item">
        <span class="label">第 1 周周一</span>
        <input
          class="date-input"
          type="date"
          :value="semesterStartDate"
          @change="onSemesterStartChange"
        />
      </div>
      <div class="section-hint">
        课表会在星期下方显示本周日期，按这个日期与当前周数推算。改完周数切换一下即可看到效果。
      </div>
    </div>

    <div class="section">
      <div class="section-title">上课提醒</div>
      <div class="config-item">
        <span class="label">开启提醒</span>
        <van-switch
          v-model="reminderPrefs.enabled"
          :disabled="!reminderSupported || reminderBusy"
          @update:model-value="onToggleReminder"
        />
      </div>
      <div v-if="reminderPrefs.enabled" class="config-item">
        <span class="label">提前</span>
        <div class="input-group">
          <van-stepper
            v-model="reminderPrefs.minutesBefore"
            :min="1"
            :max="maxMinutesBefore"
            :step="5"
            integer
            theme="round"
            button-size="22"
            @change="applyReminders"
          />
          <span class="unit">min</span>
        </div>
      </div>
      <div v-if="reminderMessage" class="section-hint">{{ reminderMessage }}</div>
      <div v-if="!reminderSupported" class="section-hint">
        上课提醒依赖 Android 的闹钟与通知，当前平台不可用。
      </div>
      <div v-if="reminderSupported && reminderPrefs.enabled && !batteryExempt" class="section-hint">
        系统可能限制后台闹钟而导致提醒延后，建议把本应用加入电池优化白名单。
        <button class="mini-link haptics" @click="openBatterySettings">去设置</button>
      </div>
      <div v-if="reminderSupported && reminderPrefs.enabled" class="section-hint">
        每次打开应用会为未来 7 天重新排一遍提醒；超过一周不开应用，后面的提醒不会自动排上。
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

.date-input {
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 15%, transparent);
  background: color-mix(in srgb, var(--theme-header-bg) 8%, transparent);
  color: var(--theme-header-text);
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  padding: 6px 8px;
  border-radius: 6px;
}

/* The native control renders its own indicator; let the theme colours through instead. */
.date-input::-webkit-calendar-picker-indicator {
  filter: invert(0.45);
}

.section-hint {
  font-size: 11px;
  line-height: 1.6;
  opacity: 0.5;
  margin-top: 8px;
}

.mini-link {
  border: none;
  background: none;
  padding: 0 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--theme-card-border-color);
  text-decoration: underline;
}
</style>