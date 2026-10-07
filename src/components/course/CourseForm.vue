<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { X, BookOpen, Settings } from "@lucide/vue";
import { useTheme } from "@/composables/useTheme";
import { confirmAction } from "@/utils/confirm";
import { DELETE_SEMESTER_CONFIRM } from "@/utils/scheduleDelete";

// Was a stub with a "TODO: 课程表单" comment and no references anywhere, which left the
// app with no way to enter a course at all -- an empty timetable could only ever be filled
// by importing a CSV/JSON. This is the form the grid opens when an empty slot is tapped.
const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const MAX_SELECTABLE_SPAN = 4;

export interface CourseFormSubmitPayload {
  name: string;
  teacher?: string;
  location?: string;
  span: number;
  weekScope: "all" | "current" | "custom";
  startWeek?: number;
  endWeek?: number;
  weekType?: "all" | "odd" | "even";
}

const props = withDefaults(defineProps<{
  show: boolean;
  mode?: "add" | "edit";
  day: number;
  period: number;
  currentWeek?: number;
  totalWeeks?: number;
  maxPeriod?: number;
  initialName?: string;
  initialTeacher?: string;
  initialLocation?: string;
  initialSpan?: number;
}>(), {
  mode: "add",
  currentWeek: 1,
  totalWeeks: 20,
  maxPeriod: 10,
  initialName: "",
  initialTeacher: "",
  initialLocation: "",
  initialSpan: 1
});

const emit = defineEmits<{
  "update:show": [value: boolean];
  submit: [payload: CourseFormSubmitPayload];
}>();

const { cssVariables } = useTheme();

const name = ref("");
const teacher = ref("");
const location = ref("");
const span = ref(1);
const weekScope = ref<"all" | "current" | "custom">("all");
const customStartWeek = ref(1);
const customEndWeek = ref(20);
const customWeekType = ref<"all" | "odd" | "even">("all");
const error = ref("");

const weekTypeOptions: { value: "all" | "odd" | "even"; label: string }[] = [
  { value: "all", label: "全部周" },
  { value: "odd", label: "仅单周" },
  { value: "even", label: "仅双周" },
];

// Reset each time the sheet opens, otherwise text from the previous cell leaks into the
// next one and a course silently lands on the wrong slot.
watch(() => props.show, (visible) => {
  if (!visible) return;
  const editing = props.mode === "edit";
  name.value = editing ? props.initialName : "";
  teacher.value = editing ? props.initialTeacher : "";
  location.value = editing ? props.initialLocation : "";
  span.value = editing ? Math.max(1, props.initialSpan) : 1;
  weekScope.value = editing ? "current" : "all";
  customStartWeek.value = 1;
  customEndWeek.value = props.totalWeeks;
  customWeekType.value = "all";
  error.value = "";
});

const maxSpan = computed(() => Math.max(1, props.maxPeriod - props.period + 1));
const spanOptions = computed(() =>
  Array.from({ length: Math.min(maxSpan.value, MAX_SELECTABLE_SPAN) }, (_, i) => i + 1)
);
const slotLabel = computed(() => `第 ${props.currentWeek} 周 · ${DAY_NAMES[props.day - 1] ?? ""} 第 ${props.period} 节`);

const submit = async () => {
  const trimmed = name.value.trim();
  if (!trimmed) {
    error.value = "请输入课程名称";
    return;
  }
  if (weekScope.value === "custom" && customStartWeek.value > customEndWeek.value) {
    error.value = "起始周不能大于结束周";
    return;
  }
  if (props.mode === "edit" && weekScope.value === "all") {
    const ok = await confirmAction({
      title: DELETE_SEMESTER_CONFIRM.title,
      message: DELETE_SEMESTER_CONFIRM.message,
      confirmText: DELETE_SEMESTER_CONFIRM.confirmText,
      danger: true
    });
    if (!ok) return;
  }
  emit("submit", {
    name: trimmed,
    teacher: teacher.value.trim() || undefined,
    location: location.value.trim() || undefined,
    span: Math.min(span.value, maxSpan.value),
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
        <Settings v-if="mode === 'edit'" :size="18" />
        <BookOpen v-else :size="18" />
        {{ mode === "edit" ? "课程设置" : "添加课程" }}
      </h2>
      <div class="app-popup-sub">{{ slotLabel }}</div>

      <label class="field">
        <span class="field-label">课程名称</span>
        <input
          v-model="name"
          class="field-input"
          type="text"
          placeholder="必填，例如 高等数学"
          @keyup.enter="submit"
        />
      </label>

      <label class="field">
        <span class="field-label">教师</span>
        <input v-model="teacher" class="field-input" type="text" placeholder="选填" />
      </label>

      <label class="field">
        <span class="field-label">地点</span>
        <input v-model="location" class="field-input" type="text" placeholder="选填，例如 A101" />
      </label>

      <div class="field">
        <span class="field-label">连排节数</span>
        <div class="span-options">
          <button
            v-for="option in spanOptions"
            :key="option"
            type="button"
            class="span-option"
            :class="{ active: span === option }"
            @click="span = option"
          >
            {{ option }} 节
          </button>
        </div>
      </div>

      <div class="field">
        <span class="field-label">应用周次</span>
        <div class="scope-options">
          <button
            type="button"
            class="scope-option"
            :class="{ active: weekScope === 'all' }"
            @click="weekScope = 'all'"
          >
            {{ mode === "edit" ? "整学期" : "所有周" }}
          </button>
          <button
            type="button"
            class="scope-option"
            :class="{ active: weekScope === 'current' }"
            @click="weekScope = 'current'"
          >
            {{ mode === "edit" ? "仅本周" : `仅当前周（第 ${currentWeek} 周）` }}
          </button>
          <button
            type="button"
            class="scope-option"
            :class="{ active: weekScope === 'custom' }"
            @click="weekScope = 'custom'"
          >
            自定义
          </button>
        </div>

        <!-- 自定义周次详情 -->
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

      <button class="app-btn app-btn--primary" @click="submit">保存</button>
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

.field-input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 15%, transparent);
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  color: var(--theme-body-text);
  font-size: 14px;
  outline: none;
}

.field-input::placeholder {
  color: var(--theme-body-text);
  opacity: 0.35;
}

.span-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.span-option {
  flex: 1;
  min-width: 56px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 15%, transparent);
  background: transparent;
  color: var(--theme-body-text);
  font-size: 13px;
  opacity: 0.65;
  transition:
    transform var(--dur-base) var(--ease-spring),
    opacity var(--dur-fast) ease-out,
    background-color var(--dur-fast) ease-out,
    border-color var(--dur-fast) ease-out;
}

.span-option.active {
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

.scope-options {
  display: flex;
  gap: 6px;
}

.scope-option {
  flex: 1;
  height: 36px;
  padding: 0 6px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 15%, transparent);
  background: transparent;
  color: var(--theme-body-text);
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--dur-base, 0.2s) var(--ease-spring, ease),
    opacity var(--dur-fast, 0.15s) ease-out,
    background-color var(--dur-fast, 0.15s) ease-out,
    border-color var(--dur-fast, 0.15s) ease-out;
}

.scope-option.active {
  opacity: 1;
  font-weight: 600;
  border-color: var(--theme-accent);
  color: var(--theme-on-accent);
  background: var(--theme-accent);
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
  transition: all var(--dur-fast, 0.15s) ease;
}

.week-type-btn.active {
  opacity: 1;
  font-weight: 600;
  border-color: var(--theme-accent);
  color: var(--theme-on-accent);
  background: var(--theme-accent);
}
</style>
