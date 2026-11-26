<script setup lang="ts">
import { computed } from "vue";
import { ArrowLeft } from "@lucide/vue";
import { useCourses } from "@/composables/useCourses";
import { readExamSnapshot } from "@/services/eams/examStorage";

const { activeCourseTableId, activeCourseTable } = useCourses();
const snapshot = computed(() => readExamSnapshot(activeCourseTableId.value));
</script>

<template>
  <div class="exam-view">
    <header class="exam-header">
      <RouterLink to="/" class="back-link" aria-label="返回课表">
        <ArrowLeft :size="20" />
      </RouterLink>
      <h1>考试安排</h1>
    </header>

    <main class="exam-content">
      <p class="exam-summary">
        {{ activeCourseTable?.name || "当前课表" }}<template v-if="snapshot"> · {{ snapshot.exams.length }} 场考试</template>
      </p>
      <p v-if="snapshot" class="exam-summary">上次同步 {{ new Date(snapshot.syncedAt).toLocaleString("zh-CN") }}</p>
      <p v-if="!snapshot" class="exam-summary">请在「导入课表 → 教务同步」中同步考试。</p>
      <p v-else-if="!snapshot.exams.length" class="exam-summary">本学期暂无已安排的考试。</p>
      <ul v-else class="exam-list">
        <li
          v-for="(exam, index) in snapshot.exams"
          :key="index"
          class="exam-card"
        >
          <h2>{{ exam.courseName }}</h2>
          <p><time :datetime="exam.date">{{ exam.date }}</time> · {{ exam.startTime }}–{{ exam.endTime }}</p>
          <p>{{ exam.location || "考场待定" }}<template v-if="exam.seat"> · 座位 {{ exam.seat }}</template></p>
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
.exam-view {
  min-height: 100vh;
  background: var(--theme-bg-color);
  color: var(--theme-body-text);
}

.exam-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(8px + var(--safe-top)) calc(16px + var(--safe-right)) 8px calc(8px + var(--safe-left));
  background: var(--theme-bg-color);
  border-bottom: 1px solid var(--theme-grid-line-color);
}

.back-link {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: inherit;
}

.exam-header h1 {
  font-size: 18px;
}

.exam-content {
  padding: 16px calc(16px + var(--safe-right)) calc(16px + var(--safe-bottom)) calc(16px + var(--safe-left));
}

.exam-summary {
  margin: 0 0 12px;
  font-size: 13px;
}

.exam-list {
  display: grid;
  gap: 10px;
  list-style: none;
}

.exam-card {
  display: grid;
  gap: 5px;
  padding: 12px;
  border: 1px solid var(--theme-grid-line-color);
  border-radius: 12px;
}

.exam-card h2 {
  font-size: 15px;
}

.exam-card p {
  font-size: 13px;
  opacity: 0.78;
}
</style>
