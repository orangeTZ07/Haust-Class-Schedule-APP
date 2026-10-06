<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { X, Trash2 } from "@lucide/vue";
import { useTheme } from "@/composables/useTheme";
import { confirmAction } from "@/utils/confirm";
import {
  DELETE_SEMESTER_CONFIRM,
  type DeleteScopePayload,
  type DeleteWeekScope,
  type DeleteWeekType
} from "@/utils/scheduleDelete";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const props = withDefaults(defineProps<{
  show: boolean;
  day: number;
  period: number;
  courseName?: string;
  currentWeek?: number;
  totalWeeks?: number;
}>(), {
  courseName: "",
  currentWeek: 1,
  totalWeeks: 20
});

const emit = defineEmits<{
  "update:show": [value: boolean];
  submit: [payload: DeleteScopePayload];
}>();

const { cssVariables } = useTheme();

const weekScope = ref<DeleteWeekScope>("current");
const customStartWeek = ref(1);
const customEndWeek = ref(20);
const customWeekType = ref<DeleteWeekType>("all");
const error = ref("");
const confirming = ref(false);

const weekTypeOptions: { value: DeleteWeekType; label: string }[] = [
  { value: "all", label: "全部周" },
  { value: "odd", label: "仅单周" },
  { value: "even", label: "仅双周" }
];

watch(() => props.show, (visible) => {
  if (!visible) return;
  weekScope.value = "current";
  customStartWeek.value = 1;
  customEndWeek.value = props.totalWeeks;
  customWeekType.value = "all";
  error.value = "";
  confirming.value = false;
});

const slotLabel = computed(() => {
  const day = DAY_NAMES[props.day - 1] ?? "";
  const name = props.courseName ? `「${props.courseName}」 · ` : "";
  return `${name}第 ${props.currentWeek} 周 · ${day} 第 ${props.period} 节`;
});

const submit = async () => {
  if (confirming.value) return;
  if (weekScope.value === "custom" && customStartWeek.value > customEndWeek.value) {
    error.value = "起始周不能大于结束周";
    return;
  }
  error.value = "";

  if (weekScope.value === "all") {
    confirming.value = true;
    const ok = await confirmAction({
      title: DELETE_SEMESTER_CONFIRM.title,
      message: DELETE_SEMESTER_CONFIRM.message,
      confirmText: DELETE_SEMESTER_CONFIRM.confirmText,
      danger: true
    });
    confirming.value = false;
    if (!ok) return;
  }

  emit("submit", {
    weekScope: weekScope.value,
    startWeek: weekScope.value === "custom" ? customStartWeek.value : undefined,
    endWeek: weekScope.value === "custom" ? customEndWeek.value : undefined,
    weekType: weekScope.value === "custom" ? customWeekType.value : "all"
  });
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
        <Trash2 :size="18" />
        删除课程
      </h2>
      <div class="app-popup-sub">{{ slotLabel }}</div>

      <div class="field">
        <span class="field-label">删除范围</span>
        <div class="scope-options">
          <button
            type="button"
            class="scope-option"
            :class="{ active: weekScope === 'all', danger: weekScope === 'all' }"
            @click="weekScope = 'all'"
          >
            整学期
          </button>
          <button
            type="button"
            class="scope-option"
            :class="{ active: weekScope === 'current' }"
            @click="weekScope = 'current'"
          >
            仅当前周（第 {{ currentWeek }} 周）
          </button>
          <button
            type="button"
            class="scope-option"
            :class="{ active: weekScope === 'custom' }"
            @click="weekScope = 'custom'"
          >
            自定义周次
          </button>
        </div>

        <div v-if="weekScope === 'custom'" class="custom-weeks-card">
          <div class="custom-row">
            <span class="custom-label">周次范围</span>
            <div class="custom-steppers">
              <span>第</span>
              <input v-model.number="customStartWeek" type="number" min="1" :max="customEndWeek" class="mini-week-input" />
              <span>周 至 第</span>
              <input v-model.number="customEndWeek" type="number" :min="customStartWeek" :max="totalWeeks" class="mini-week-input" />
              <span>周</span>
            </div>
          </div>
          <div class="custom-row">
            <span class="custom-label">单双周</span>
            <div class="week-type-options">
              <button
                v-for="item in weekTypeOptions"
                :key="item.value"
                type="button"
                class="week-type-btn"
                :class="{ active: customWeekType === item.value }"
                @click="customWeekType = item.value"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="error" class="error-text">{{ error }}</div>

      <button class="app-btn app-btn--danger" :disabled="confirming" @click="submit">删除</button>
    </div>
  </van-popup>
</template>

<style scoped>
.field {
  display: block;
  margin-bottom: 14px;
}

.field-label {
  display: block;
  font-size: 12px;
  opacity: 0.6;
  margin-bottom: 6px;
}

.scope-options {
  display: flex;
  gap: 6px;
}

.scope-option {
  flex: 1;
  min-height: 36px;
  padding: 0 4px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 15%, transparent);
  background: transparent;
  color: var(--theme-body-text);
  font-size: 11px;
  opacity: 0.75;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.25;
}

.scope-option.active {
  opacity: 1;
  font-weight: 600;
  border-color: var(--theme-accent);
  color: var(--theme-on-accent);
  background: var(--theme-accent);
}

.scope-option.danger.active {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: #fff;
}

.custom-weeks-card {
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--theme-body-text);
}

.custom-label {
  opacity: 0.7;
}

.custom-steppers {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mini-week-input {
  width: 44px;
  height: 28px;
  text-align: center;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 15%, transparent);
  background: var(--theme-bg-color);
  color: var(--theme-body-text);
  font-size: 13px;
  font-weight: 600;
  outline: none;
}

.week-type-options {
  display: flex;
  gap: 4px;
}

.week-type-btn {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 15%, transparent);
  background: transparent;
  color: var(--theme-body-text);
  font-size: 11px;
  opacity: 0.7;
}

.week-type-btn.active {
  opacity: 1;
  font-weight: 600;
  border-color: var(--theme-accent);
  color: var(--theme-on-accent);
  background: var(--theme-accent);
}

.error-text {
  color: var(--color-danger);
  font-size: 12px;
  margin-bottom: 10px;
}
</style>
