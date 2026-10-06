<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useCourses } from "@/composables/useCourses";
import { useTheme } from "@/composables/useTheme";
import { useReminder } from "@/composables/useReminder";
import { checkBatteryOptimization, openBatterySettings } from "@/services/reminderService";
import { describeError } from "@/utils/describeError";

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

const {
  prefs: reminderPrefs,
  permission: reminderPermission,
  maxMinutesBefore,
  reschedule,
  refreshPermission,
  ensurePermission
} = useReminder();

const reminderBusy = ref(false);
const reminderMessage = ref("");
const batteryExempt = ref(true);

const NO_PERMISSION_MESSAGE = "未获得通知权限，系统会丢弃提醒。请在系统设置中允许通知后重试。";

const refreshBatteryState = async () => {
  batteryExempt.value = await checkBatteryOptimization();
};

/// Reminders are on by default, so the switch can be on while the system still refuses
/// notifications. This is what the "没有通知权限" hint below keys off.
const permissionMissing = computed(
  () => reminderPermission.value === "denied" || reminderPermission.value === "prompt"
);

onMounted(() => {
  refreshBatteryState();
  // Failing to read the permission only means the hint stays hidden.
  refreshPermission().catch(() => {});
});

/// Called after the switch flips, so reminderPrefs already holds the new value.
///
/// The notification permission is requested before anything is scheduled: on Android 13+ the
/// alarm would otherwise fire into a notification the system drops, and on iOS the request would
/// be refused outright, so the feature would look broken rather than unpermitted.
const onToggleReminder = async () => {
  if (reminderBusy.value) return;
  reminderBusy.value = true;
  try {
    if (reminderPrefs.value.enabled && !(await ensurePermission())) {
      reminderPrefs.value.enabled = false;
      reminderMessage.value = NO_PERMISSION_MESSAGE;
      return;
    }
    await applyReminders();
  } catch (e) {
    // 这里以前是 `${(e as Error).message}` —— 而 Tauri 拒绝 Promise 时给的是**错误值本身**，
    // 对 Err(String) 就是字符串，取 .message 得到 undefined。于是一次真实失败被显示成
    // 字面的 "undefined"，既没帮到用户，也让排查无从下手。现在用 describeError 取出原文。
    reminderMessage.value = `设置提醒失败：${describeError(e)}`;
  } finally {
    reminderBusy.value = false;
  }
};

/// The 去授权 link next to the missing-permission hint. Unlike the switch it leaves the preference
/// alone: the user already wants reminders, they only need the permission.
const onRequestPermission = async () => {
  if (reminderBusy.value) return;
  reminderBusy.value = true;
  try {
    if (await ensurePermission()) {
      await applyReminders();
    } else {
      reminderMessage.value = NO_PERMISSION_MESSAGE;
    }
  } catch (e) {
    reminderMessage.value = `设置提醒失败：${describeError(e)}`;
  } finally {
    reminderBusy.value = false;
  }
};

/// Also used when the lead time changes: the trigger times are computed from it, so every alarm
/// in the window has to be rewritten.
const applyReminders = async () => {
  const result = await reschedule();
  if (result.noPermission) {
    reminderMessage.value = "没有通知权限，提醒没有排上。";
    return;
  }
  const summary = reminderPrefs.value.enabled
    ? `已为未来 7 天注册 ${result.scheduled} 个提醒`
    : `已关闭，并取消 ${result.cancelled} 个提醒`;
  // A failure has to be visible. Reporting the count alone is exactly what made the previous
  // round impossible to diagnose: "registered 0" reads the same whether there was nothing to
  // schedule or every single call was rejected.
  reminderMessage.value = result.error ? `${summary}；失败：${result.error}` : summary;
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
          :disabled="reminderBusy"
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
      <div v-if="reminderPrefs.enabled && permissionMissing" class="section-hint">
        没有通知权限，提醒不会发出。
        <button class="mini-link haptics" @click="onRequestPermission">去授权</button>
        系统不再弹窗时，请到系统设置里允许本应用发送通知，回到应用后会自动恢复。
      </div>
      <div v-if="reminderPrefs.enabled && !batteryExempt" class="section-hint">
        系统可能限制后台闹钟而导致提醒延后，建议把本应用加入电池优化白名单。
        <button class="mini-link haptics" @click="openBatterySettings">去设置</button>
      </div>
      <div v-if="reminderPrefs.enabled" class="section-hint">
        打开应用、从后台切回来、或者课表和上课时间有改动时，会为未来 7 天重新排一遍提醒；超过一周不打开应用，后面的提醒不会自动排上。
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

    <van-popup
      v-model:show="showPicker"
      position="bottom"
      round
      class="app-popup app-popup--sheet"
      :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.25)' }"
    >
      <div class="app-sheet-handle" />
      <van-time-picker
        v-model="currentTime"
        title="选择时间"
        @confirm="onConfirm"
        @cancel="showPicker = false"
      />
      <div class="app-sheet-safe" />
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

/* The small controls below sit on the page, not on the header band, so they are tinted with and
   lettered in body-text. header-text is white on the Vant preset, which left them blank. */
.reset-btn {
  height: 24px;
  padding: 0 10px;
  font-size: 11px;
  background: var(--theme-bg-color); /* Fallback */
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  border: 1px solid var(--theme-grid-line-color); /* Fallback */
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
  color: var(--theme-body-text);
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
  color: var(--theme-body-text);
  font-family: 'Monaco', 'Courier New', monospace;
  padding: 4px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
}

/* 适配 Vant 组件的主题色偏移 */
:deep(.van-stepper__plus), :deep(.van-stepper__minus) {
  background-color: color-mix(in srgb, var(--theme-body-text) 10%, transparent) !important;
  color: var(--theme-body-text) !important;
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

/* Transparent, so the sheet's own glass shows through instead of an opaque block inside it. */
:deep(.van-picker) {
  background-color: transparent !important;
}

:deep(.van-picker__mask) {
  background-image: none !important; /* 彻底去掉白色渐变遮罩 */
}

:deep(.van-picker__hairline) {
  border-top: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent) !important;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent) !important;
  background-color: color-mix(in srgb, var(--theme-accent) 6%, transparent);
}

:deep(.van-picker__toolbar) {
  border-bottom: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  background-color: transparent !important;
}

:deep(.van-picker__cancel) {
  color: var(--theme-body-text) !important;
  opacity: 0.6;
}

/* The accent, not Vant's default blue, so 确定 matches the other confirm buttons. */
:deep(.van-picker__confirm) {
  color: var(--theme-accent) !important;
  font-weight: 700;
}

:deep(.van-picker-column__item) {
  color: var(--theme-body-text) !important;
  opacity: 0.4;
}

:deep(.van-picker-column__item--selected) {
  color: var(--theme-accent) !important;
  opacity: 1;
  font-weight: 700;
}

:deep(.van-picker__title) {
  color: var(--theme-body-text) !important;
}

.date-input {
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 15%, transparent);
  background: color-mix(in srgb, var(--theme-body-text) 6%, transparent);
  color: var(--theme-body-text);
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
  /* No colour was set, so the text inherited the page's fixed #333 and disappeared on dark themes. */
  color: var(--theme-body-text);
  opacity: 0.6;
  margin-top: 8px;
}

.mini-link {
  border: none;
  background: none;
  padding: 0 2px;
  font-size: 11px;
  font-weight: 600;
  /* The accent: the card border colour is pale on the light presets and dim on the dark ones, which
     made this link hard to find. */
  color: var(--theme-accent);
  text-decoration: underline;
}
</style>