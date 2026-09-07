<script setup lang="ts">
import { useCourses } from "@/composables/useCourses";
import { useRouter } from "vue-router";
import { ArrowLeft, Trash2, MapPin, User, Clock } from '@lucide/vue';
import { showConfirmDialog, showToast } from 'vant';

const router = useRouter();
const { courses, schedules, removeCourse, getDaySchedules } = useCourses();

const goBack = () => {
  router.back();
};

const handleDelete = async (courseId: number, courseName: string) => {
  try {
    await showConfirmDialog({
      title: '删除课程',
      message: `确定要删除课程《${courseName}》吗？相关的所有课段也将被移除。`,
      className: 'theme-confirm-dialog',
    });
    
    await removeCourse(courseId);
    showToast('删除成功');
  } catch {
    // 用户取消删除
  }
};

const getCourseSchedules = (courseId: number) => {
  return schedules.value.filter(s => s.courseId === courseId);
};

const days = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const formatSchedule = (s: any) => {
  return `${days[s.dayOfWeek]} ${s.startPeriod}-${s.endPeriod}节`;
};
</script>

<template>
  <div class="course-list-page">
    <div class="header">
      <div class="back-btn" @click="goBack">
        <ArrowLeft :size="20" />
      </div>
      <span class="title">课程管理</span>
      <div class="spacer"></div>
    </div>

    <div class="content">
      <div v-if="courses.length === 0" class="empty-state">
        <div class="empty-icon">📚</div>
        <p>暂无课程，快去添加吧</p>
      </div>

      <div class="course-list" v-else>
        <div v-for="course in courses" :key="course.id" class="course-item">
          <div class="course-color-bar" :style="{ backgroundColor: course.color }"></div>
          <div class="course-main">
            <div class="course-header">
              <h3 class="course-name">{{ course.name }}</h3>
              <div class="delete-btn" @click="handleDelete(course.id, course.name)">
                <Trash2 :size="16" />
              </div>
            </div>
            
            <div class="course-details">
              <div class="detail-row" v-if="course.teacher">
                <User :size="12" class="icon" />
                <span>{{ course.teacher }}</span>
              </div>
              <div class="detail-row" v-if="course.location">
                <MapPin :size="12" class="icon" />
                <span>{{ course.location }}</span>
              </div>
              <div class="detail-row">
                <Clock :size="12" class="icon" />
                <div class="schedule-tags">
                  <span v-for="s in getCourseSchedules(course.id)" :key="s.id" class="tag">
                    {{ formatSchedule(s) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.course-list-page {
  min-height: 100vh;
  background: var(--theme-bg-color);
  color: var(--theme-body-text);
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--theme-bg-color);
  padding: 16px;
  padding-top: calc(16px + env(safe-area-inset-top, 0px));
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
}

.back-btn {
  padding: 4px;
  cursor: pointer;
  opacity: 0.7;
}

.title {
  font-size: 17px;
  font-weight: 600;
}

.spacer {
  flex: 1;
}

.content {
  padding: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 100px;
  opacity: 0.5;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.course-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.course-item {
  display: flex;
  background: color-mix(in srgb, var(--theme-grid-line-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 20%, transparent);
  border-radius: 12px;
  overflow: hidden;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.course-color-bar {
  width: 6px;
}

.course-main {
  flex: 1;
  padding: 12px 16px;
}

.course-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.course-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.delete-btn {
  padding: 4px;
  color: #ee0a24;
  opacity: 0.6;
  cursor: pointer;
  transition: opacity 0.2s;
}

.delete-btn:active {
  opacity: 1;
}

.course-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.8;
}

.icon {
  opacity: 0.6;
}

.schedule-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  background: color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}
</style>
