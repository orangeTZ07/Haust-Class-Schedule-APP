<script setup lang="ts" generic="T extends string">
import type { Component } from "vue";

/// Pill-shaped switch between a few mutually exclusive options. The import sheet needs it three
/// times (method tabs, weekly / semester, overwrite / append), and the old popups each hand-rolled
/// their own copy with slightly different sizes.
defineProps<{
  modelValue: T;
  options: { value: T; label: string; icon?: Component; badge?: string }[];
  /// Shorter, for a switch that sits under the main tabs so the two do not read as the same level.
  compact?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: T];
}>();
</script>

<template>
  <div class="segmented" :class="{ compact }" role="tablist">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      class="segment"
      :class="{ active: modelValue === option.value }"
      :aria-selected="modelValue === option.value"
      @click="emit('update:modelValue', option.value)"
    >
      <component :is="option.icon" v-if="option.icon" :size="15" />
      <span class="segment-label">{{ option.label }}</span>
      <span v-if="option.badge" class="segment-badge">{{ option.badge }}</span>
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-body-text) 7%, transparent);
}

.segment {
  flex: 1;
  min-width: 0;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 4px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--theme-body-text);
  font-size: 13px;
  font-weight: 600;
  opacity: 0.6;
  transition: background 0.2s, opacity 0.2s, box-shadow 0.2s;
}

/* The selected segment is lifted with the page background rather than a tint, so it reads as a
   raised pill on every theme, dark ones included. */
.segment.active {
  background: var(--theme-bg-color);
  color: var(--theme-body-text);
  opacity: 1;
  box-shadow: 0 1px 6px color-mix(in srgb, var(--theme-body-text) 22%, transparent);
}

.segmented.compact .segment {
  height: 32px;
  font-size: 12px;
}

.segment-label {
  white-space: nowrap;
}

.segment-badge {
  padding: 0 5px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  border-radius: 999px;
  color: var(--theme-body-text);
  background: color-mix(in srgb, var(--color-success) 24%, transparent);
}
</style>
