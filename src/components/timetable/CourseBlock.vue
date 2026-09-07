<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import type { Course, CourseSchedule } from "@/types/course";
import { useTheme } from "@/composables/useTheme";
import { useCourses } from "@/composables/useCourses";

interface FloatingFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  boundaryLeft?: number;
  boundaryTop?: number;
  boundaryWidth: number;
  boundaryHeight: number;
}

const { themeConfig } = useTheme();
const { periodConfig } = useCourses();

const props = withDefaults(defineProps<{
  course: Course;
  schedule: CourseSchedule;
  span?: number;
  isDragging?: boolean;
  dragOffset?: { x: number; y: number };
  conflictCount?: number;
  conflictIndex?: number;
  floatingFrame?: FloatingFrame;
  allowDrag?: boolean;
  allowExpand?: boolean;
  showConflictTag?: boolean;
}>(), {
  allowDrag: true,
  allowExpand: true,
  showConflictTag: true
});

const emit = defineEmits<{
  (e: "drag-start", event: PointerEvent): void;
  (e: "activate", event: MouseEvent): void;
}>();

const isExpanded = ref(false);
const blockRef = ref<HTMLElement | null>(null);
const pointerDown = ref<{ x: number; y: number } | null>(null);
const suppressNextClick = ref(false);

const toggleExpand = (e: MouseEvent) => {
  e.stopPropagation();
  if (suppressNextClick.value) {
    suppressNextClick.value = false;
    return;
  }
  if (props.allowExpand === false) {
    emit("activate", e);
    return;
  }
  if (props.isDragging) return;
  isExpanded.value = !isExpanded.value;
};

const closeExpand = () => {
  isExpanded.value = false;
};

const handlePointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  if (props.allowDrag === false) return;
  if (isExpanded.value) return;
  pointerDown.value = { x: event.clientX, y: event.clientY };
  emit("drag-start", event);
};

const handlePointerUp = (event: PointerEvent) => {
  if (!pointerDown.value) return;
  const dx = event.clientX - pointerDown.value.x;
  const dy = event.clientY - pointerDown.value.y;
  if (Math.hypot(dx, dy) > 6) {
    suppressNextClick.value = true;
  }
  pointerDown.value = null;
};

onMounted(() => {
  window.addEventListener('click', closeExpand);
});

onUnmounted(() => {
  window.removeEventListener('click', closeExpand);
});

const style = computed(() => {
  const isFloating = !!props.floatingFrame;
  const baseHeight = props.floatingFrame?.height ?? (props.span || 1) * 50 - 4;
  const hasConflict = (props.conflictCount || 0) > 1;
  const conflictIndex = props.conflictIndex || 0;
  const shouldOffsetConflict = hasConflict && props.conflictCount === 2;
  const courseColor = props.course.color || 'var(--theme-card-border-color)';
  const normalLeft = props.floatingFrame
    ? `${props.floatingFrame.left}px`
    : shouldOffsetConflict ? `${2 + conflictIndex * 8}px` : '2px';
  const normalWidth = props.floatingFrame
    ? `${props.floatingFrame.width}px`
    : shouldOffsetConflict ? 'calc(100% - 12px)' : 'calc(100% - 4px)';
  const normalShadow = hasConflict
    ? '0 4px 14px rgba(238, 10, 36, 0.16)'
    : themeConfig.value.flatStyle ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.02)';
  const normalBackground = hasConflict
    ? 'color-mix(in srgb, rgba(238, 10, 36, 0.22) calc(var(--theme-card-opacity) * 100%), rgba(128, 128, 128, 0.72))'
    : themeConfig.value.mode === 'dark'
      ? 'color-mix(in srgb, var(--theme-bg-color) 74%, transparent)'
      : 'color-mix(in srgb, var(--theme-bg-color) 78%, transparent)';
  const normalBorderColor = hasConflict
    ? 'color-mix(in srgb, #ee0a24 65%, var(--theme-card-border-color))'
    : `color-mix(in srgb, ${courseColor} 58%, var(--theme-card-border-color))`;
  
  if (isExpanded.value) {
    const expandedHeight = Math.max(baseHeight * 1.5, 140);
    if (isFloating && props.floatingFrame) {
      const expandedWidth = Math.max(props.floatingFrame.width * 2.2, 220);
      const boundaryLeft = props.floatingFrame.boundaryLeft ?? 0;
      const boundaryTop = props.floatingFrame.boundaryTop ?? 0;
      const minLeft = boundaryLeft + 6;
      const maxLeft = boundaryLeft + props.floatingFrame.boundaryWidth - expandedWidth - 6;
      const minTop = boundaryTop + 6;
      const maxTop = boundaryTop + props.floatingFrame.boundaryHeight - expandedHeight - 6;
      const centeredLeft = props.floatingFrame.left - (expandedWidth - props.floatingFrame.width) / 2;
      const centeredTop = props.floatingFrame.top - (expandedHeight - props.floatingFrame.height) / 2;

      return {
        height: `${expandedHeight}px`,
        width: `${expandedWidth}px`,
        left: `${Math.min(Math.max(centeredLeft, minLeft), Math.max(minLeft, maxLeft))}px`,
        top: `${Math.min(Math.max(centeredTop, minTop), Math.max(minTop, maxTop))}px`,
        zIndex: 240,
        transform: 'translate(0, 0)',
        backdropFilter: themeConfig.value.flatStyle ? 'none' : 'blur(16px)',
        webkitBackdropFilter: themeConfig.value.flatStyle ? 'none' : 'blur(16px)',
        boxShadow: '0 12px 48px rgba(0, 0, 0, 0.3)',
        borderColor: normalBorderColor,
        backgroundColor: themeConfig.value.mode === 'dark'
          ? 'color-mix(in srgb, var(--theme-bg-color) 85%, #ffffff 15%)'
          : 'color-mix(in srgb, var(--theme-bg-color) 85%, #000000 10%)',
      };
    }

    const totalPeriods = periodConfig.value.morningPeriods +
      periodConfig.value.afternoonPeriods +
      (periodConfig.value.eveningPeriods || 0);

    // 动态计算左右位移
    let leftOffset = '-80%';
    if (props.schedule.dayOfWeek <= 2) leftOffset = '-5%';
    if (props.schedule.dayOfWeek >= 6) leftOffset = '-150%';

    // 动态计算上下位移，防止越界
    let topOffset = -(expandedHeight - baseHeight) / 2;
    
    // 如果是第一、二节课，防止被 TopBar 遮挡
    if (props.schedule.startPeriod <= 2) {
      topOffset = 2; // 贴近顶部但不超出
    } 
    // 如果是最后两节课，防止超出底部
    else if (props.schedule.endPeriod >= totalPeriods - 1) {
      topOffset = -(expandedHeight - baseHeight) - 2;
    }

    return {
      height: `${expandedHeight}px`,
      width: '260%',
      left: leftOffset,
      top: `${topOffset}px`,
      zIndex: 100,
      backdropFilter: themeConfig.value.flatStyle ? 'none' : 'blur(16px)',
      webkitBackdropFilter: themeConfig.value.flatStyle ? 'none' : 'blur(16px)',
      boxShadow: '0 12px 48px rgba(0, 0, 0, 0.3)',
      borderColor: normalBorderColor,
      backgroundColor: themeConfig.value.mode === 'dark' 
        ? 'color-mix(in srgb, var(--theme-bg-color) 85%, #ffffff 15%)'
        : 'color-mix(in srgb, var(--theme-bg-color) 85%, #000000 10%)',
    };
  }

  return {
    height: `${baseHeight}px`,
    width: normalWidth,
    left: normalLeft,
    top: props.floatingFrame ? `${props.floatingFrame.top}px` : '2px',
    zIndex: props.isDragging ? 200 : hasConflict ? 2 + conflictIndex : 1,
    transform: props.isDragging
      ? `translate(${props.dragOffset?.x || 0}px, ${props.dragOffset?.y || 0}px)`
      : 'translate(0, 0)',
    backdropFilter: themeConfig.value.flatStyle ? 'none' : 'blur(4px)',
    webkitBackdropFilter: themeConfig.value.flatStyle ? 'none' : 'blur(4px)',
    boxShadow: normalShadow,
    borderColor: normalBorderColor,
    backgroundColor: normalBackground,
  };
});

const periodText = computed(() => {
  if (props.schedule.startPeriod === props.schedule.endPeriod) {
    return `${props.schedule.startPeriod}节`;
  }
  return `${props.schedule.startPeriod}-${props.schedule.endPeriod}节`;
});
</script>

<template>
  <div 
    ref="blockRef"
    class="course-block" 
    :data-schedule-id="schedule.id"
    :class="{ 'is-expanded': isExpanded, 'is-dragging': isDragging, 'is-conflicting': (conflictCount || 0) > 1 }"
    :style="style"
    @pointerdown="handlePointerDown"
    @pointerup="handlePointerUp"
    @click="toggleExpand"
  >
    <div class="course-accent" :style="{ backgroundColor: course.color }"></div>
    <div class="course-name">{{ course.name }}</div>
    <div class="course-info" v-if="course.location">
      <span class="loc-icon" v-if="!themeConfig.hideIcons">📍</span>
      {{ course.location }}
    </div>
    <div v-if="(conflictCount || 0) > 1" class="conflict-count-badge">
      {{ conflictCount }}
    </div>
    <van-tag
      v-if="showConflictTag !== false && (conflictCount || 0) > 2"
      class="conflict-tag"
      type="warning"
      size="medium"
      round
    >
      冲突 {{ conflictCount }}
    </van-tag>
    <div class="course-period">{{ periodText }}</div>
  </div>
</template>

<style scoped>
.course-block {
  position: absolute;
  border: var(--theme-card-border-width) solid color-mix(in srgb, var(--theme-card-border-color) 40%, transparent);
  border-radius: var(--theme-card-border-radius);
  padding: 6px 7px 6px 9px;
  font-size: clamp(9px, 2.5vw, 11px); /* 响应式基础字号 */
  line-height: 1.3;
  overflow: hidden;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  transition: 
    all 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    z-index 0s 0.3s;
  display: flex;
  flex-direction: column;
}

.course-accent {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 4px;
  width: 3px;
  border-radius: 999px;
  opacity: 0.72;
}

.course-block.is-conflicting {
  padding-right: 20px;
}

.course-block.is-conflicting .course-accent {
  background: #ee0a24 !important;
  opacity: 0.85;
}

.course-block.is-dragging {
  cursor: grabbing;
  pointer-events: none;
  transition: none;
  border-color: var(--theme-card-border-color);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18) !important;
}

.course-block:hover {
  z-index: 5 !important;
  transition: all 0.2s ease, z-index 0s;
  border-color: color-mix(in srgb, var(--theme-card-border-color) 80%, transparent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
}

.course-block.is-expanded {
  overflow-y: auto; /* 允许垂直滚动内容 */
  padding: 12px;
  border-color: var(--theme-card-border-color);
  scrollbar-width: none; /* 隐藏 Firefox 滚动条 */
  transition: 
    all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    z-index 0s;
}

.course-block.is-expanded::-webkit-scrollbar {
  display: none; /* 隐藏 Chrome/Safari 滚动条 */
}

.course-name {
  font-weight: 700;
  font-size: inherit;
  color: var(--theme-body-text);
  margin-bottom: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  transition: all 0.2s ease;
}

.course-block.is-conflicting .course-name {
  padding-right: 4px;
}

.is-expanded .course-name {
  -webkit-line-clamp: unset;
  font-size: clamp(11px, 3.5vw, 14px); /* 展开态响应式字号 */
  margin-bottom: 8px;
  line-height: 1.4;
}

.course-info {
  font-size: 0.9em;
  color: var(--theme-body-text);
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.conflict-tag {
  align-self: flex-start;
  margin-top: 4px;
  --van-tag-warning-color: color-mix(in srgb, #ff976a 92%, var(--theme-bg-color));
  --van-tag-text-color: #fff;
}

.conflict-count-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  background: color-mix(in srgb, #ee0a24 88%, var(--theme-bg-color));
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  line-height: 14px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(238, 10, 36, 0.24);
}

.is-expanded .conflict-count-badge {
  top: 8px;
  right: 8px;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  font-size: 10px;
}

.is-expanded .course-info {
  white-space: normal;
  opacity: 0.9;
  line-height: 1.5;
  margin-bottom: 8px;
}

.loc-icon {
  font-size: 8px;
  opacity: 0.7;
}

.is-expanded .loc-icon {
  font-size: 10px;
}

.course-period {
  font-size: 9px;
  font-weight: 500;
  color: var(--theme-body-text);
  opacity: 0.5;
  margin-top: auto;
  text-align: right;
}

.is-expanded .course-period {
  font-size: 10px;
  opacity: 0.7;
  margin-top: 8px;
}
</style>
