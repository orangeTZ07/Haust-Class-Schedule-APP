<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Check,
  CheckSquare,
  ChevronUp,
  Clock3,
  GripVertical,
  PanelBottom,
  Plus,
  SquareStack,
  Trash2,
  X
} from "@lucide/vue";
import { useTodos } from "@/composables/useTodos";
import type { Todo, TodoListType } from "@/types/todo";

const {
  pendingTodos,
  completedTodos,
  loading,
  error,
  load,
  add,
  move,
  complete,
  reopen,
  deleteMany
} = useTodos();

const title = ref("");
const dueAt = ref("");
const formError = ref("");
const completedSheetVisible = ref(false);
const selectedCompletedIds = ref<Set<number>>(new Set());
const draggingTodo = ref<{ id: number; sourceList: TodoListType } | null>(null);
const dropTarget = ref<{ list: TodoListType; beforeId: number | null } | null>(null);
const busy = ref(false);

const canSubmit = computed(() => title.value.trim().length > 0 && dueAt.value.length > 0);
const selectedCompletedCount = computed(() => selectedCompletedIds.value.size);
const allCompletedSelected = computed(() =>
  completedTodos.value.length > 0 && selectedCompletedIds.value.size === completedTodos.value.length
);

onMounted(() => {
  load().catch(() => undefined);
});

const submitTodo = async () => {
  if (!canSubmit.value || busy.value) return;

  formError.value = "";
  busy.value = true;
  try {
    await add({
      title: title.value,
      dueAt: dueAt.value
    });
    title.value = "";
    dueAt.value = "";
  } catch (e) {
    formError.value = e instanceof Error ? e.message : "新增待办失败";
  } finally {
    busy.value = false;
  }
};

const formatTime = (value: string | null) => {
  if (!value) return "无截止";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
};

const beforeIdFromEvent = (event: DragEvent, targetTodo: Todo): number | null => {
  const card = event.currentTarget as HTMLElement | null;
  if (!card) return targetTodo.id;

  const rect = card.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  return event.clientY < midpoint ? targetTodo.id : targetTodo.nextId;
};

const startDrag = (event: DragEvent, todo: Todo) => {
  draggingTodo.value = { id: todo.id, sourceList: todo.listType };
  event.dataTransfer?.setData("text/plain", String(todo.id));
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
};

const clearDrag = () => {
  draggingTodo.value = null;
  dropTarget.value = null;
};

const allowDropOnList = (event: DragEvent, list: TodoListType, beforeId: number | null = null) => {
  if (!draggingTodo.value) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  dropTarget.value = { list, beforeId };
};

const allowDropOnCard = (event: DragEvent, list: TodoListType, todo: Todo) => {
  if (!draggingTodo.value || draggingTodo.value.id === todo.id) return;
  allowDropOnList(event, list, beforeIdFromEvent(event, todo));
};

const getTodoElement = (todo: Todo): HTMLElement | null => {
  return document.querySelector<HTMLElement>(
    `[data-todo-id="${todo.id}"][data-list="${todo.listType}"]`
  );
};

const THEME_STYLE_PROPS = [
  "--theme-bg-color",
  "--theme-body-text",
  "--theme-grid-line-color",
  "--theme-header-text",
  "--color-primary",
  "--color-success",
  "--color-danger"
];

const SNAPSHOT_STYLE_PROPS = [
  "background",
  "backgroundColor",
  "borderColor",
  "borderRadius",
  "borderStyle",
  "borderWidth",
  "boxShadow",
  "color",
  "fill",
  "font",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "opacity",
  "outlineColor",
  "stroke",
  "textDecorationColor",
  "textDecorationLine"
];

const freezeFlightStyles = (source: Element, clone: Element) => {
  const sourceStyle = window.getComputedStyle(source);
  const cloneStyle = (clone as HTMLElement | SVGElement).style;

  for (const prop of THEME_STYLE_PROPS) {
    const value = sourceStyle.getPropertyValue(prop);
    if (value) {
      cloneStyle.setProperty(prop, value);
    }
  }

  for (const prop of SNAPSHOT_STYLE_PROPS) {
    cloneStyle.setProperty(prop, sourceStyle.getPropertyValue(prop));
  }

  const sourceChildren = Array.from(source.children);
  const cloneChildren = Array.from(clone.children);
  sourceChildren.forEach((child, index) => {
    const clonedChild = cloneChildren[index];
    if (clonedChild) {
      freezeFlightStyles(child, clonedChild);
    }
  });
};

const animateCardTransfer = async (source: HTMLElement | null, targetSelector: string) => {
  const target = document.querySelector<HTMLElement>(targetSelector);
  if (!source || !target) return;

  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  const deltaX = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
  const deltaY = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2);

  clone.classList.add("todo-flight-card");
  freezeFlightStyles(source, clone);
  clone.style.left = `${sourceRect.left}px`;
  clone.style.top = `${sourceRect.top}px`;
  clone.style.width = `${sourceRect.width}px`;
  clone.style.height = `${sourceRect.height}px`;
  source.classList.add("is-transferring");
  (document.getElementById("app") || document.body).appendChild(clone);

  try {
    await clone.animate(
      [
        { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1, filter: "blur(0)" },
        { transform: `translate3d(${deltaX * 0.18}px, ${deltaY * 0.08}px, 0) scale(0.98)`, opacity: 0.96, offset: 0.24 },
        { transform: `translate3d(${deltaX * 1.05}px, ${deltaY * 1.04}px, 0) scale(0.72)`, opacity: 0.86, offset: 0.72 },
        { transform: `translate3d(${deltaX * 0.96}px, ${deltaY * 0.96}px, 0) scale(0.66)`, opacity: 0.72, offset: 0.86 },
        { transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(0.58)`, opacity: 0, filter: "blur(1px)" }
      ],
      {
        duration: 520,
        easing: "cubic-bezier(0.18, 0.9, 0.24, 1)"
      }
    ).finished;
  } finally {
    clone.remove();
    source.classList.remove("is-transferring");
  }
};

const dropTodo = async (event: DragEvent, list: TodoListType, beforeId: number | null = null) => {
  event.preventDefault();
  const dragging = draggingTodo.value;
  if (!dragging || busy.value) {
    clearDrag();
    return;
  }

  busy.value = true;
  try {
    const target = dropTarget.value?.list === list ? dropTarget.value : { list, beforeId };
    await move({
      id: dragging.id,
      targetList: target.list,
      beforeId: target.beforeId
    });
  } finally {
    busy.value = false;
    clearDrag();
  }
};

const completeTodo = async (todo: Todo) => {
  if (busy.value) return;
  busy.value = true;
  try {
    const flight = animateCardTransfer(getTodoElement(todo), ".completed-bottom-dock");
    await complete(todo.id);
    await flight;
  } finally {
    busy.value = false;
  }
};

const reopenTodo = async (todo: Todo) => {
  if (busy.value) return;
  busy.value = true;
  try {
    const flight = animateCardTransfer(getTodoElement(todo), ".return-drop-zone");
    await reopen(todo.id);
    await flight;
    selectedCompletedIds.value.delete(todo.id);
    selectedCompletedIds.value = new Set(selectedCompletedIds.value);
  } finally {
    busy.value = false;
  }
};

const toggleCompletedSelection = (id: number) => {
  const next = new Set(selectedCompletedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedCompletedIds.value = next;
};

const toggleSelectAllCompleted = () => {
  selectedCompletedIds.value = allCompletedSelected.value
    ? new Set()
    : new Set(completedTodos.value.map(todo => todo.id));
};

const deleteSelectedCompleted = async () => {
  const ids = Array.from(selectedCompletedIds.value);
  if (ids.length === 0 || busy.value) return;

  busy.value = true;
  try {
    await deleteMany(ids);
    selectedCompletedIds.value = new Set();
  } finally {
    busy.value = false;
  }
};

const closeCompletedSheet = () => {
  completedSheetVisible.value = false;
  selectedCompletedIds.value = new Set();
};

const isDropBefore = (list: TodoListType, id: number) =>
  dropTarget.value?.list === list && dropTarget.value.beforeId === id;

const isDropAtEnd = (list: TodoListType) =>
  dropTarget.value?.list === list && dropTarget.value.beforeId === null;
</script>

<template>
  <section class="todo-panel" aria-label="待办列表">
    <div class="todo-section-header">
      <div>
        <span class="todo-kicker">Todo Queue</span>
        <h2 class="todo-title">待办</h2>
      </div>
      <button class="completed-dock-button" type="button" @click="completedSheetVisible = true">
        <SquareStack :size="16" />
        <span>{{ completedTodos.length }}</span>
        <ChevronUp :size="14" />
      </button>
    </div>

    <form class="todo-form" @submit.prevent="submitTodo">
      <input
        v-model="title"
        class="todo-title-input"
        type="text"
        maxlength="48"
        placeholder="新建待办"
        aria-label="待办内容"
      />
      <div class="todo-form-row">
        <input
          v-model="dueAt"
          class="todo-date-input"
          type="datetime-local"
          aria-label="截止时间"
        />
        <button class="todo-add-button" type="submit" :disabled="!canSubmit || busy" aria-label="添加待办">
          <Plus :size="16" />
        </button>
      </div>
      <p v-if="formError || error" class="todo-error">{{ formError || error?.message }}</p>
    </form>

    <div
      class="todo-queue pending-queue"
      :class="{ empty: !pendingTodos.length, active: draggingTodo?.sourceList !== 'completed' && dropTarget?.list === 'pending' }"
      @dragover="allowDropOnList($event, 'pending')"
      @drop="dropTodo($event, 'pending')"
    >
      <p v-if="loading && !pendingTodos.length" class="todo-empty">加载中</p>
      <p v-else-if="!pendingTodos.length" class="todo-empty">暂无待办</p>
      <template v-else>
        <article
          v-for="todo in pendingTodos"
          :key="todo.id"
          class="todo-card"
          :class="{ 'drop-before': isDropBefore('pending', todo.id) }"
          :data-todo-id="todo.id"
          data-list="pending"
          draggable="true"
          @dragstart="startDrag($event, todo)"
          @dragend="clearDrag"
          @dragover.stop="allowDropOnCard($event, 'pending', todo)"
          @drop.stop="dropTodo($event, 'pending', todo.id)"
        >
          <GripVertical class="drag-handle" :size="18" aria-hidden="true" />
          <button
            class="todo-complete-button"
            type="button"
            :disabled="busy"
            :aria-label="`完成 ${todo.title}`"
            @click="completeTodo(todo)"
          >
            <Check :size="14" />
          </button>
          <div class="todo-card-body">
            <h3 class="todo-card-title">{{ todo.title }}</h3>
            <div class="todo-meta">
              <Clock3 :size="13" />
              <span>{{ formatTime(todo.dueAt) }}</span>
            </div>
          </div>
        </article>
        <div class="queue-end-drop" :class="{ active: isDropAtEnd('pending') }">拖到这里放到队尾</div>
      </template>
    </div>

    <button
      class="completed-bottom-dock"
      type="button"
      @dragover="allowDropOnList($event, 'completed')"
      @drop="dropTodo($event, 'completed')"
      @click="completedSheetVisible = true"
    >
      <PanelBottom :size="18" />
      <span>已完成事项</span>
      <strong>{{ completedTodos.length }}</strong>
    </button>

    <van-popup
      v-model:show="completedSheetVisible"
      position="bottom"
      round
      :style="{ height: '72vh' }"
      @closed="selectedCompletedIds = new Set()"
    >
      <section
        class="completed-sheet"
        aria-label="已完成事项"
        @dragover="allowDropOnList($event, 'completed')"
        @drop="dropTodo($event, 'completed')"
      >
        <div class="sheet-handle" />
        <header class="sheet-header">
          <div>
            <span class="todo-kicker">Completed Queue</span>
            <h2 class="sheet-title">已完成事项</h2>
          </div>
          <button class="sheet-close-button" type="button" aria-label="关闭已完成事项" @click="closeCompletedSheet">
            <X :size="18" />
          </button>
        </header>

        <div class="selection-toolbar">
          <button class="toolbar-button" type="button" :disabled="!completedTodos.length" @click="toggleSelectAllCompleted">
            <CheckSquare :size="15" />
            <span>{{ allCompletedSelected ? "取消全选" : "全选" }}</span>
          </button>
          <span class="selection-count">已选 {{ selectedCompletedCount }}</span>
          <button
            class="delete-selected-button"
            type="button"
            :disabled="selectedCompletedCount === 0 || busy"
            @click="deleteSelectedCompleted"
          >
            <Trash2 :size="15" />
            <span>删除</span>
          </button>
        </div>

        <div
          class="return-drop-zone"
          :class="{ active: dropTarget?.list === 'pending' }"
          @dragover="allowDropOnList($event, 'pending')"
          @drop="dropTodo($event, 'pending')"
        >
          拖到这里移回待办队列
        </div>

        <div class="completed-queue" :class="{ empty: !completedTodos.length }">
          <p v-if="!completedTodos.length" class="todo-empty">把卡片拖到这里，或点击待办左侧圆形按钮完成。</p>
          <template v-else>
            <article
              v-for="todo in completedTodos"
              :key="todo.id"
              class="completed-card"
              :class="{
                selected: selectedCompletedIds.has(todo.id),
                'drop-before': isDropBefore('completed', todo.id)
              }"
              :data-todo-id="todo.id"
              data-list="completed"
              draggable="true"
              @dragstart="startDrag($event, todo)"
              @dragend="clearDrag"
              @dragover.stop="allowDropOnCard($event, 'completed', todo)"
              @drop.stop="dropTodo($event, 'completed', todo.id)"
            >
              <GripVertical class="drag-handle" :size="18" aria-hidden="true" />
              <label class="completed-select">
                <input
                  type="checkbox"
                  :checked="selectedCompletedIds.has(todo.id)"
                  :aria-label="`选择 ${todo.title}`"
                  @change="toggleCompletedSelection(todo.id)"
                />
                <span class="completed-select-indicator" aria-hidden="true">
                  <Check :size="13" />
                </span>
              </label>
              <div class="completed-card-body">
                <span class="completed-card-title">{{ todo.title }}</span>
                <span class="completed-card-time">完成于 {{ formatTime(todo.completedAt) }}</span>
              </div>
              <button class="reopen-button" type="button" :disabled="busy" @click="reopenTodo(todo)">移回</button>
            </article>
            <div class="queue-end-drop" :class="{ active: isDropAtEnd('completed') }">拖到这里放到队尾</div>
          </template>
        </div>
      </section>
    </van-popup>
  </section>
</template>

<style scoped>
.todo-panel {
  width: min(100%, 760px);
  margin: 0 auto;
  padding-bottom: 88px;
}

.todo-section-header,
.sheet-header,
.selection-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.todo-kicker {
  display: block;
  margin-bottom: 2px;
  color: color-mix(in srgb, var(--theme-body-text) 56%, transparent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
}

.todo-title,
.sheet-title {
  margin: 0;
  color: var(--theme-header-text);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
}

.completed-dock-button,
.completed-bottom-dock,
.toolbar-button,
.delete-selected-button,
.sheet-close-button,
.reopen-button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.completed-dock-button {
  height: 34px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--theme-header-text);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 800;
}

.todo-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.todo-title-input,
.todo-date-input {
  width: 100%;
  min-width: 0;
  height: 42px;
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-bg-color) 88%, transparent);
  color: var(--theme-body-text);
  font: inherit;
  outline: none;
}

.todo-title-input {
  padding: 0 12px;
}

.todo-date-input {
  flex: 1;
  padding: 0 10px;
  font-size: 13px;
}

.todo-title-input:focus,
.todo-date-input:focus {
  border-color: color-mix(in srgb, var(--color-primary) 64%, var(--theme-grid-line-color));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.todo-form-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.todo-add-button {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border: 0;
  border-radius: 8px;
  background: var(--color-primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.todo-add-button:disabled,
.delete-selected-button:disabled,
.toolbar-button:disabled,
.reopen-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.todo-add-button:not(:disabled):active {
  transform: scale(0.94);
}

.todo-error {
  color: var(--color-danger);
  font-size: 12px;
  line-height: 1.35;
}

.todo-queue,
.completed-queue {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
  min-height: 148px;
  border-radius: 10px;
  transition: background 0.16s ease, box-shadow 0.16s ease;
}

.todo-queue.active,
.completed-queue:not(.empty):has(.queue-end-drop.active) {
  background: color-mix(in srgb, var(--color-primary) 7%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 22%, transparent);
}

.todo-empty {
  padding: 22px 12px;
  border: 1px dashed color-mix(in srgb, var(--theme-grid-line-color) 58%, transparent);
  border-radius: 8px;
  color: color-mix(in srgb, var(--theme-body-text) 62%, transparent);
  font-size: 13px;
  text-align: center;
}

.todo-card,
.completed-card {
  position: relative;
  display: grid;
  align-items: center;
  gap: 12px;
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 42%, transparent);
  border-radius: 8px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-bg-color) 94%, transparent),
      color-mix(in srgb, var(--theme-grid-line-color) 10%, var(--theme-bg-color))
    );
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.055);
  user-select: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, opacity 0.18s ease;
}

.todo-card {
  grid-template-columns: 22px 32px minmax(0, 1fr);
  padding: 13px 14px;
  overflow: hidden;
}

.todo-card::after {
  content: "";
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 0 999px 999px 0;
  background: color-mix(in srgb, var(--color-primary) 72%, var(--color-success));
}

.completed-card {
  grid-template-columns: 22px 28px minmax(0, 1fr) auto;
  padding: 12px 14px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-bg-color) 90%, transparent),
      color-mix(in srgb, var(--color-success) 8%, var(--theme-bg-color))
    );
}

.todo-card[draggable="true"],
.completed-card[draggable="true"] {
  cursor: grab;
}

.todo-card:hover,
.completed-card:hover {
  border-color: color-mix(in srgb, var(--color-primary) 24%, var(--theme-grid-line-color));
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.085);
  transform: translateY(-1px);
}

.todo-card:active,
.completed-card:active {
  cursor: grabbing;
}

.todo-card.is-transferring,
.completed-card.is-transferring {
  opacity: 0.22;
  transform: scale(0.985);
}

.drop-before::before {
  content: "";
  position: absolute;
  top: -7px;
  left: 8px;
  right: 8px;
  height: 3px;
  border-radius: 999px;
  background: var(--color-primary);
}

.drag-handle {
  color: color-mix(in srgb, var(--theme-body-text) 45%, transparent);
  justify-self: center;
}

.todo-complete-button {
  width: 28px;
  height: 28px;
  border: 1.5px solid color-mix(in srgb, var(--color-success) 72%, var(--theme-grid-line-color));
  border-radius: 50%;
  background: color-mix(in srgb, var(--theme-bg-color) 80%, transparent);
  color: var(--color-success);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--color-success) 7%, transparent);
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

.todo-complete-button:hover {
  background: var(--color-success);
  color: #fff;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--color-success) 28%, transparent);
}

.todo-card-body,
.completed-card-body {
  min-width: 0;
}

.todo-card-title {
  margin: 0;
  color: var(--theme-body-text);
  font-size: 15px;
  font-weight: 750;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.todo-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  color: color-mix(in srgb, var(--theme-body-text) 62%, transparent);
  font-size: 13px;
  line-height: 1;
}

.todo-flight-card {
  position: fixed !important;
  z-index: 3000 !important;
  pointer-events: none !important;
  margin: 0 !important;
  transform-origin: center center;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18) !important;
  will-change: transform, opacity, filter;
}

.queue-end-drop {
  min-height: 34px;
  border: 1px dashed color-mix(in srgb, var(--theme-grid-line-color) 62%, transparent);
  border-radius: 8px;
  color: color-mix(in srgb, var(--theme-body-text) 45%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.queue-end-drop.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.completed-bottom-dock {
  position: fixed;
  left: 50%;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  z-index: 20;
  width: min(calc(100vw - 32px), 460px);
  height: 52px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-color) 92%, transparent);
  color: var(--theme-body-text);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 42%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 36px;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  font-weight: 700;
}

.completed-bottom-dock strong {
  min-width: 32px;
  height: 26px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-success) 16%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.completed-sheet {
  height: 100%;
  padding: 10px 16px calc(18px + env(safe-area-inset-bottom, 0px));
  background: var(--theme-bg-color);
  color: var(--theme-body-text);
  display: flex;
  flex-direction: column;
}

.sheet-handle {
  width: 42px;
  height: 4px;
  margin: 0 auto 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-body-text) 22%, transparent);
}

.sheet-close-button {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  color: var(--theme-body-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.selection-toolbar {
  margin-top: 14px;
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-body-text) 6%, transparent);
}

.return-drop-zone {
  min-height: 42px;
  margin-top: 12px;
  border: 1px dashed color-mix(in srgb, var(--color-primary) 42%, var(--theme-grid-line-color));
  border-radius: 8px;
  color: color-mix(in srgb, var(--theme-body-text) 58%, transparent);
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}

.return-drop-zone.active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 13%, transparent);
  border-color: var(--color-primary);
}

.toolbar-button,
.delete-selected-button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
}

.toolbar-button {
  background: color-mix(in srgb, var(--theme-bg-color) 84%, transparent);
  color: var(--theme-body-text);
}

.delete-selected-button {
  background: color-mix(in srgb, var(--color-danger) 14%, transparent);
  color: var(--color-danger);
}

.selection-count {
  flex: 1;
  text-align: center;
  color: color-mix(in srgb, var(--theme-body-text) 62%, transparent);
  font-size: 13px;
  font-weight: 700;
}

.completed-queue {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 2px 0;
}

.completed-select {
  width: 28px;
  height: 28px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.completed-select input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.completed-select-indicator {
  width: 22px;
  height: 22px;
  border: 1.5px solid color-mix(in srgb, var(--theme-grid-line-color) 72%, var(--theme-body-text));
  border-radius: 7px;
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--theme-bg-color) 94%, transparent),
      color-mix(in srgb, var(--theme-grid-line-color) 12%, var(--theme-bg-color))
    );
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
  transform: scale(1);
  transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.completed-select-indicator svg {
  opacity: 0;
  transform: scale(0.72);
  transition: opacity 0.14s ease, transform 0.18s cubic-bezier(0.2, 1.4, 0.3, 1);
}

.completed-select input:focus-visible + .completed-select-indicator {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.completed-select input:checked + .completed-select-indicator {
  border-color: color-mix(in srgb, var(--color-primary) 78%, var(--theme-grid-line-color));
  background: var(--color-primary);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--color-primary) 26%, transparent);
}

.completed-select input:checked + .completed-select-indicator svg {
  opacity: 1;
  transform: scale(1);
}

.completed-select:active .completed-select-indicator {
  transform: scale(0.9);
}

.completed-card.selected {
  border-color: color-mix(in srgb, var(--color-primary) 62%, var(--theme-grid-line-color));
  background: color-mix(in srgb, var(--color-primary) 10%, var(--theme-bg-color));
}

.completed-card-title {
  display: block;
  color: var(--theme-body-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.completed-card-time {
  display: block;
  margin-top: 4px;
  color: color-mix(in srgb, var(--theme-body-text) 52%, transparent);
  font-size: 12px;
  line-height: 1;
}

.reopen-button {
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 800;
}

@media (min-width: 680px) {
  .todo-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px 42px;
    align-items: start;
  }

  .todo-form-row {
    display: contents;
  }

  .todo-error {
    grid-column: 1 / -1;
  }
}

@media (max-width: 520px) {
  .completed-card {
    grid-template-columns: 18px 24px minmax(0, 1fr);
  }

  .reopen-button {
    grid-column: 3;
    width: max-content;
  }

  .selection-toolbar {
    flex-wrap: wrap;
  }

  .selection-count {
    order: 3;
    flex-basis: 100%;
  }
}
</style>
