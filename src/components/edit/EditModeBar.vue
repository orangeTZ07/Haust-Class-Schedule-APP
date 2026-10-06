<script setup lang="ts">
import { Check, Redo2, Undo2 } from "@lucide/vue";
import { useTheme } from "@/composables/useTheme";

defineProps<{
  canUndo: boolean;
  canRedo: boolean;
  count: number;
}>();

const { isDark } = useTheme();

const emit = defineEmits<{
  undo: [];
  redo: [];
  exit: [];
}>();
</script>

<template>
  <div class="edit-bar" role="region" aria-label="编辑">
    <button type="button" class="edit-btn" aria-label="回退" :disabled="!canUndo" @click="emit('undo')">
      <Undo2 :size="18" />
    </button>
    <button type="button" class="edit-btn" aria-label="前进" :disabled="!canRedo" @click="emit('redo')">
      <Redo2 :size="18" />
    </button>
    <p v-if="count !== 0" class="edit-count" :class="{ 'is-on-dark': isDark }">
      {{ count > 0 ? `+${count}` : `-${Math.abs(count)}` }}
    </p>
    <button type="button" class="edit-done" aria-label="完成" @click="emit('exit')">
      <Check :size="18" stroke-width="2.5" />
    </button>
  </div>
</template>

<style scoped>
/* Solid theme fill and a border, so the bar stays readable on a custom background or a dark preset.
   It sits in the page flow, not over a blocking overlay. */
.edit-bar {
  position: relative;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 16%, var(--theme-bg-color));
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
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
  color: #000;
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.edit-count.is-on-dark {
  color: #fff;
}

.edit-done {
  margin-left: auto;
  color: var(--theme-on-accent);
  background: var(--theme-accent);
  border-color: transparent;
}
</style>
