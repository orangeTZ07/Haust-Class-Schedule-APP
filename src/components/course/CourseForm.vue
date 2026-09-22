<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { X, BookOpen } from "@lucide/vue";
import { useTheme } from "@/composables/useTheme";

// Was a stub with a "TODO: 课程表单" comment and no references anywhere, which left the
// app with no way to enter a course at all -- an empty timetable could only ever be filled
// by importing a CSV/JSON. This is the form the grid opens when an empty slot is tapped.
const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const MAX_SELECTABLE_SPAN = 4;

const props = withDefaults(defineProps<{
  show: boolean;
  day: number;
  period: number;
  maxPeriod?: number;
}>(), {
  maxPeriod: 10
});

const emit = defineEmits<{
  "update:show": [value: boolean];
  submit: [payload: { name: string; teacher?: string; location?: string; span: number }];
}>();

const { cssVariables, isDark } = useTheme();

const name = ref("");
const teacher = ref("");
const location = ref("");
const span = ref(1);
const error = ref("");

// Reset each time the sheet opens, otherwise text from the previous cell leaks into the
// next one and a course silently lands on the wrong slot.
watch(() => props.show, (visible) => {
  if (!visible) return;
  name.value = "";
  teacher.value = "";
  location.value = "";
  span.value = 1;
  error.value = "";
});

const maxSpan = computed(() => Math.max(1, props.maxPeriod - props.period + 1));
const spanOptions = computed(() =>
  Array.from({ length: Math.min(maxSpan.value, MAX_SELECTABLE_SPAN) }, (_, i) => i + 1)
);
const slotLabel = computed(() => `${DAY_NAMES[props.day - 1] ?? ""} 第 ${props.period} 节`);

const submit = () => {
  const trimmed = name.value.trim();
  if (!trimmed) {
    error.value = "请输入课程名称";
    return;
  }
  emit("submit", {
    name: trimmed,
    teacher: teacher.value.trim() || undefined,
    location: location.value.trim() || undefined,
    span: Math.min(span.value, maxSpan.value)
  });
};
</script>

<template>
  <van-popup
    :show="props.show"
    @update:show="val => emit('update:show', val)"
    round
    position="center"
    class="custom-course-form-popup"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.2)' }"
  >
    <div class="course-form-card" :class="{ 'is-dark': isDark }">
      <button class="minimal-close-btn haptics" @click="emit('update:show', false)">
        <X :size="16" />
      </button>

      <div class="card-title">
        <BookOpen :size="18" style="margin-right: 8px;" />
        添加课程
      </div>

      <div class="slot-hint">{{ slotLabel }}</div>

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
            class="span-option haptics"
            :class="{ active: span === option }"
            @click="span = option"
          >
            {{ option }} 节
          </button>
        </div>
      </div>

      <div v-if="error" class="error-text">{{ error }}</div>

      <button class="minimal-primary-btn haptics" @click="submit">保存</button>
    </div>
  </van-popup>
</template>

<style scoped>
.custom-course-form-popup {
  width: 85%;
  max-width: 340px;
  background: color-mix(in srgb, var(--theme-bg-color) 85%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.course-form-card {
  position: relative;
  padding: 32px 20px 20px;
  color: var(--theme-body-text);
}

.minimal-close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  color: var(--theme-body-text);
  opacity: 0.6;
}

.card-title {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  color: var(--theme-header-text);
}

.slot-hint {
  font-size: 12px;
  opacity: 0.55;
  margin-bottom: 18px;
  letter-spacing: 0.5px;
}

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
  height: 38px;
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
  height: 34px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 15%, transparent);
  background: transparent;
  color: var(--theme-body-text);
  font-size: 13px;
  opacity: 0.65;
}

.span-option.active {
  opacity: 1;
  font-weight: 600;
  border-color: var(--theme-card-border-color);
  background: color-mix(in srgb, var(--theme-card-border-color) 14%, transparent);
}

.error-text {
  color: #ee0a24;
  font-size: 12px;
  margin-bottom: 10px;
}

.minimal-primary-btn {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-header-text);
  background: color-mix(in srgb, var(--theme-card-border-color) 20%, transparent);
}
</style>
