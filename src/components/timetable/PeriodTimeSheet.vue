<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { showToast } from "vant";
import { useCourses } from "@/composables/useCourses";
import { useTheme } from "@/composables/useTheme";
import type { PeriodTimeConfig } from "@/types/course";
import {
  clampMessage,
  formatMinutes,
  periodConfigsEqual,
  periodRange,
  SECTION_NAMES,
  sectionOfPeriod,
  shiftPeriods,
  shiftSummaryLines,
  summarizeShift
} from "@/utils/periodSchedule";

const props = defineProps<{
  show: boolean;
  /// 第几节（从 1 数）。
  period: number;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

const { periodConfig, setPeriodConfig } = useCourses();
const { cssVariables } = useTheme();

const cloneConfig = (config: PeriodTimeConfig): PeriodTimeConfig => ({
  ...config,
  periods: config.periods.map(range => ({ ...range }))
});

/// base 是打开时的样子，draft 是正在改的样子。保存前课表和提醒都不受影响。
const base = ref<PeriodTimeConfig>(cloneConfig(periodConfig.value));
const draft = ref<PeriodTimeConfig>(cloneConfig(periodConfig.value));
const field = ref<"start" | "end">("start");
const notice = ref("");
/// 越界被拉回时，滚轮已经停在用户选的位置，要强制它回到真实值。
const syncTick = ref(0);
let openedAt = 0;

watch(() => props.show, (visible) => {
  if (!visible) return;
  base.value = cloneConfig(periodConfig.value);
  draft.value = cloneConfig(periodConfig.value);
  field.value = "start";
  notice.value = "";
  openedAt = Date.now();
});

const range = computed(() => periodRange(draft.value, props.period) ?? { start: 0, end: 0 });
const original = computed(() => periodRange(base.value, props.period) ?? { start: 0, end: 0 });
const sectionName = computed(() => {
  const span = sectionOfPeriod(draft.value, props.period);
  return span ? SECTION_NAMES[span.section] : "";
});
const duration = computed(() => range.value.end - range.value.start);
const dirty = computed(() => !periodConfigsEqual(base.value, draft.value));
const summaryLines = computed(() => shiftSummaryLines(summarizeShift(base.value, draft.value, props.period)));

const applyEdit = (target: "start" | "end", value: number) => {
  const result = shiftPeriods(draft.value, props.period, { field: target, value });
  draft.value = result.config;
  notice.value = result.clamp ? clampMessage(draft.value, props.period, result.clamp) : "";
  if (result.clamp) syncTick.value += 1;
};

const nudge = (minutes: number) => {
  applyEdit(field.value, range.value[field.value] + minutes);
};

const NUDGES = [-5, -1, 1, 5];

const pickerValue = computed<string[]>({
  get() {
    void syncTick.value;
    const minutes = range.value[field.value];
    return [String(Math.floor(minutes / 60)).padStart(2, "0"), String(minutes % 60).padStart(2, "0")];
  },
  set(value) {
    const minutes = Number(value[0]) * 60 + Number(value[1]);
    if (!Number.isFinite(minutes) || minutes === range.value[field.value]) return;
    applyEdit(field.value, minutes);
  }
});

const close = () => emit("update:show", false);

// 长按松手那一下可能紧跟着一次点击落在刚出现的遮罩上，不能把刚打开的面板关掉。
const onOverlayClick = () => {
  if (Date.now() - openedAt < 350) return;
  close();
};

const save = () => {
  if (!dirty.value) {
    close();
    return;
  }
  if (!setPeriodConfig(draft.value)) {
    showToast({ message: "这个时间排不进去", type: "fail" });
    return;
  }
  const saved = periodRange(draft.value, props.period);
  showToast({
    message: saved ? `第 ${props.period} 节：${formatMinutes(saved.start)}–${formatMinutes(saved.end)}` : "已保存",
    type: "success"
  });
  close();
};
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    class="app-popup app-popup--sheet period-sheet"
    :style="cssVariables"
    :close-on-click-overlay="false"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.25)' }"
    @update:show="value => emit('update:show', value)"
    @click-overlay="onOverlayClick"
  >
    <div class="app-sheet-handle" />
    <div class="sheet-body">
      <h2 class="app-popup-title sheet-title">
        <span>第 {{ period }} 节</span>
        <span class="section-tag">{{ sectionName }}</span>
        <span class="duration-tag">{{ duration }} 分钟</span>
      </h2>
      <div class="app-popup-sub">原来 {{ formatMinutes(original.start) }}–{{ formatMinutes(original.end) }}</div>

      <div class="field-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="field-tab"
          :class="{ active: field === 'start' }"
          :aria-selected="field === 'start'"
          @click="field = 'start'"
        >
          <span class="field-name">开始</span>
          <span class="field-time">{{ formatMinutes(range.start) }}</span>
        </button>
        <span class="field-dash">–</span>
        <button
          type="button"
          role="tab"
          class="field-tab"
          :class="{ active: field === 'end' }"
          :aria-selected="field === 'end'"
          @click="field = 'end'"
        >
          <span class="field-name">结束</span>
          <span class="field-time">{{ formatMinutes(range.end) }}</span>
        </button>
      </div>

      <van-time-picker
        v-model="pickerValue"
        :show-toolbar="false"
        :visible-option-num="3"
        :option-height="40"
      />

      <div class="nudges">
        <button
          v-for="step in NUDGES"
          :key="step"
          type="button"
          class="nudge haptics"
          @click="nudge(step)"
        >
          {{ step > 0 ? "+" : "−" }}{{ Math.abs(step) }} 分
        </button>
      </div>

      <div class="effects" aria-live="polite">
        <div class="effects-title">后面会怎样</div>
        <ul v-if="summaryLines.length" class="effects-list">
          <li v-for="line in summaryLines" :key="line">{{ line }}</li>
        </ul>
        <div v-else class="effects-empty">后面的节次不动。</div>
        <div class="effects-notice" :class="{ show: notice }">{{ notice }}</div>
      </div>
      <p class="rule">改开始：这一节整体平移；改结束：只改这一节的长短。同一时段里后面的节次跟着结束时间平移，午休、晚饭时间不动。</p>

      <div class="actions">
        <button type="button" class="app-btn" @click="close">取消</button>
        <button type="button" class="app-btn app-btn--primary" :disabled="!dirty" @click="save">保存</button>
      </div>
    </div>
    <div class="app-sheet-safe" />
  </van-popup>
</template>

<style scoped>
.sheet-body {
  padding: 16px 20px 18px;
}

.sheet-title {
  margin-bottom: 4px;
  /* No close button on this sheet, so none of the room app-popup-title keeps for one. */
  padding-right: 0;
}

.section-tag,
.duration-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
}

.duration-tag {
  margin-left: auto;
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  font-variant-numeric: tabular-nums;
}

.sheet-body :deep(.app-popup-sub) {
  margin: 0 0 12px;
}

.field-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.field-dash {
  opacity: 0.4;
}

.field-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0 7px;
  border-radius: 14px;
  border: 1.5px solid color-mix(in srgb, var(--theme-body-text) 14%, transparent);
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  color: var(--theme-body-text);
  font-family: inherit;
  transition:
    border-color var(--dur-fast) var(--ease-smooth),
    background-color var(--dur-fast) var(--ease-smooth);
}

.field-tab.active {
  border-color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
}

.field-name {
  font-size: 11px;
  opacity: 0.6;
}

.field-time {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  font-family: 'Monaco', 'Courier New', monospace;
}

.field-tab.active .field-name {
  color: var(--theme-accent);
  opacity: 1;
}

.nudges {
  display: flex;
  gap: 8px;
  margin: 2px 0 10px;
}

.nudge {
  flex: 1;
  min-height: 40px;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  color: var(--theme-body-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.nudge:active {
  background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
}

/* 固定高度：改动多少，面板都不跟着忽高忽低。 */
.effects {
  min-height: 92px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  font-size: 12px;
  line-height: 1.55;
  color: var(--theme-body-text);
}

.effects-title {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.5;
  margin-bottom: 2px;
}

.effects-list {
  margin: 0;
  padding-left: 16px;
}

.effects-empty {
  opacity: 0.7;
}

.effects-notice {
  margin-top: 4px;
  min-height: 18px;
  font-weight: 600;
  color: var(--color-danger);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-smooth);
}

.effects-notice.show {
  opacity: 1;
}

.rule {
  margin: 8px 2px 14px;
  font-size: 11px;
  line-height: 1.6;
  opacity: 0.55;
  color: var(--theme-body-text);
}

.actions {
  display: flex;
  gap: 10px;
}

.actions .app-btn {
  flex: 1;
}

/* Vant 的滚轮自带白色渐变遮罩和实色底，在玻璃面板里会糊成一块。 */
.period-sheet {
  --van-picker-background: transparent;
}

/* The mask's gradient is an inline style, so only !important gets past it. */
.period-sheet :deep(.van-picker__mask) {
  background-image: none !important;
}

.period-sheet :deep(.van-picker__frame) {
  border-radius: 10px;
  background-color: color-mix(in srgb, var(--theme-accent) 8%, transparent);
}

.period-sheet :deep(.van-picker-column__item) {
  color: var(--theme-body-text);
  opacity: 0.4;
}

.period-sheet :deep(.van-picker-column__item--selected) {
  color: var(--theme-accent);
  opacity: 1;
  font-weight: 700;
}
</style>
