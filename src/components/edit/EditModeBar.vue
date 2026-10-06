<script setup lang="ts">
defineProps<{
  canUndo: boolean;
  canRedo: boolean;
  count: number;
}>();

const emit = defineEmits<{
  undo: [];
  redo: [];
  exit: [];
}>();
</script>

<template>
  <div class="edit-bar" role="region" aria-label="编辑">
    <button type="button" class="edit-btn" :disabled="!canUndo" @click="emit('undo')">回退</button>
    <button type="button" class="edit-btn" :disabled="!canRedo" @click="emit('redo')">前进</button>
    <p class="edit-count">
      新增改动<span class="edit-count-num" :class="{ 'is-negative': count < 0 }">{{ count }}</span>处
    </p>
    <button type="button" class="edit-done" @click="emit('exit')">完成</button>
  </div>
</template>

<style scoped>
/* Solid theme fill and a border, so the bar stays readable on a custom background or a dark preset.
   It sits in the page flow, not over a blocking overlay. */
.edit-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin: 0 10px 8px;
  padding: 8px;
  border-radius: 14px;
  color: var(--theme-body-text);
  background: var(--theme-bg-color);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 22%, var(--theme-bg-color));
  box-shadow: 0 8px 24px color-mix(in srgb, var(--theme-body-text) 14%, transparent);
}

.edit-btn,
.edit-done {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 16%, var(--theme-bg-color));
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.edit-btn {
  color: var(--theme-body-text);
  background: var(--theme-bg-color);
}

.edit-btn:disabled {
  opacity: 0.38;
  cursor: default;
}

.edit-count {
  flex: 1 1 auto;
  margin: 0;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.edit-count-num.is-negative {
  color: var(--color-danger);
}

.edit-done {
  color: var(--theme-on-accent);
  background: var(--theme-accent);
  border-color: transparent;
}
</style>
