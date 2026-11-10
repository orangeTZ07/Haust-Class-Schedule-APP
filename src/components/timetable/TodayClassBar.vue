<script setup lang="ts">
import { computed } from "vue";
import { ChevronRight } from "@lucide/vue";
import { useCourses } from "@/composables/useCourses";
import { useToday } from "@/composables/useToday";
import { formatMinutes, periodRange } from "@/utils/periodSchedule";

const emit = defineEmits<{
  locate: [week: number, scheduleId: number];
}>();

const { schedules, getSchedulesForWeek, getCourseById, periodConfig, semesterWeekCount } = useCourses();
const { now, todayDayNumber, actualWeek } = useToday();

const summary = computed(() => {
  const week = actualWeek.value;
  if (week === null || week > semesterWeekCount.value) {
    return { message: "今天没有课", lesson: null };
  }

  const minute = now.value.getHours() * 60 + now.value.getMinutes();
  let hadClass = false;
  for (const schedule of getSchedulesForWeek(week)) {
    if (schedule.dayOfWeek !== todayDayNumber.value) continue;
    const course = getCourseById(schedule.courseId);
    const first = periodRange(periodConfig.value, schedule.startPeriod);
    const last = periodRange(periodConfig.value, schedule.endPeriod);
    if (!course || !first || !last) continue;

    hadClass = true;
    if (last.end <= minute) continue;

    const remaining = first.start - minute;
    const location = schedule.location || course.location;
    return {
      message: remaining > 0 ? "下一节" : "正在上课",
      lesson: {
        week,
        scheduleId: schedule.id,
        startTime: formatMinutes(first.start),
        details: location ? `${course.name} · ${location}` : course.name,
        countdown: remaining > 0 && remaining <= 60 ? `${remaining} 分钟后` : ""
      }
    };
  }

  return { message: hadClass ? "今天的课已上完" : "今天没有课", lesson: null };
});
</script>

<template>
  <div v-if="schedules.length" class="today-class-bar">
    <button
      v-if="summary.lesson"
      class="today-class-content"
      type="button"
      @click="emit('locate', summary.lesson.week, summary.lesson.scheduleId)"
    >
      <span class="today-class-status">{{ summary.message }}</span>
      <time :datetime="summary.lesson.startTime">{{ summary.lesson.startTime }}</time>
      <span class="today-class-details">{{ summary.lesson.details }}</span>
      <span v-if="summary.lesson.countdown" class="today-class-countdown">{{ summary.lesson.countdown }}</span>
      <ChevronRight :size="14" aria-hidden="true" />
    </button>
    <p v-else class="today-class-content today-class-empty">{{ summary.message }}</p>
  </div>
</template>

<style scoped>
.today-class-bar {
  flex: none;
  padding: 3px calc(12px + var(--safe-right)) 3px calc(12px + var(--safe-left));
  background: color-mix(in srgb, var(--theme-header-bg) 86%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 60%, transparent);
}

.today-class-content {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  width: 100%;
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-header-text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

button.today-class-content {
  cursor: pointer;
}

button.today-class-content:active {
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
}

.today-class-status {
  padding: 3px 6px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
  font-weight: 600;
}

.today-class-content time {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.today-class-details {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.today-class-content svg {
  flex: none;
}

.today-class-countdown,
.today-class-empty {
  color: color-mix(in srgb, var(--theme-header-text) 76%, transparent);
}
</style>
