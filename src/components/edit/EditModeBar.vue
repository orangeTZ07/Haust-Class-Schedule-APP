<script setup lang="ts">
defineProps<{
  canUndo: boolean;
  canRedo: boolean;
  deep: boolean;
}>();

const emit = defineEmits<{
  undo: [];
  redo: [];
  "set-deep": [enabled: boolean];
  exit: [];
}>();
</script>

<template>
  <div class="edit-bar" role="region" aria-label="编辑">
    <button type="button" class="edit-btn" :disabled="!canUndo" @click="emit('undo')">回退</button>
    <button type="button" class="edit-btn" :disabled="!canRedo" @click="emit('redo')">前进</button>
    <button
      type="button"
      class="edit-deep"
      :class="{ 'is-on': deep }"
      :aria-pressed="deep"
      title="加载历史编辑记录。打开后，回退可以回到这次编辑之前。"
      @click="emit('set-deep', !deep)"
    >
      <span>历史记录</span>
      <span class="edit-deep-hint">{{ deep ? "可回到最早的编辑" : "仅本次编辑" }}</span>
    </button>
    <button type="button" class="edit-done" @click="emit('exit')">完成</button>
  </div>
</template>

<style scoped>
/* Same idea as the coach card: a solid theme fill and a border, so the bar stays readable
   on a custom background or a dark preset. It sits in the page flow, not over a blocking overlay. */
.edit-bar {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex-shrink: 0;
  margin: 0 10px calc(8px + var(--safe-bottom));
  padding: 8px;
  border-radius: 14px;
  color: var(--theme-body-text);
  background: var(--theme-bg-color);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 22%, var(--theme-bg-color));
  box-shadow: 0 8px 24px color-mix(in srgb, var(--theme-body-text) 14%, transparent);
}

.edit-btn,
.edit-deep,
.edit-done {
  min-height: 40px;
  border-radius: 10px;
  font-family: inherit;
  cursor: pointer;
}

.edit-btn,
.edit-done {
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 16%, var(--theme-bg-color));
  font-size: 14px;
  font-weight: 700;
}

.edit-btn {
  color: var(--theme-body-text);
  background: var(--theme-bg-color);
}

.edit-btn:disabled {
  opacity: 0.38;
  cursor: default;
}

.edit-deep {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 16%, var(--theme-bg-color));
  color: var(--theme-body-text);
  background: var(--theme-bg-color);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.edit-deep.is-on {
  color: var(--theme-on-accent);
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}

.edit-deep-hint {
  font-size: 10px;
  font-weight: 500;
  opacity: 0.8;
}

.edit-done {
  color: var(--theme-on-accent);
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
</style>
