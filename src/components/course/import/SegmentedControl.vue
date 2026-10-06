<script setup lang="ts" generic="T extends string">
import { computed } from "vue";
import type { Component } from "vue";

/// Pill-shaped switch between a few mutually exclusive options. The import sheet needs it three
/// times (method tabs, weekly / semester, overwrite / append), and the old popups each hand-rolled
/// their own copy with slightly different sizes.
const props = defineProps<{
  modelValue: T;
  options: { value: T; label: string; icon?: Component; badge?: string }[];
  /// Shorter, for a switch that sits under the main tabs so the two do not read as the same level.
  compact?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: T];
}>();

/// Which slot the thumb sits over. The thumb's position is pure CSS from this index and the option
/// count (the segments are all the same width), so nothing has to be measured, and it works while
/// the control is still inside a hidden tab.
const activeIndex = computed(() => Math.max(props.options.findIndex(option => option.value === props.modelValue), 0));
</script>

<template>
  <div
    class="segmented"
    :class="{ compact }"
    role="tablist"
    :style="{ '--segment-count': options.length, '--segment-index': activeIndex }"
  >
    <span class="segmented-thumb" aria-hidden="true" />
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
  position: relative;
  /* The spring overshoots, and on the first and last segment the overshoot would carry the thumb out
     past the track. Clipped, it reads as pressing against the wall instead. */
  overflow: hidden;
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-body-text) 7%, transparent);
}

/* The selected segment is lifted with the page background rather than a tint, so it reads as a
   raised pill on every theme, dark ones included. It is one element that slides between the
   segments on the spring, instead of each segment fading its own background in and out. */
.segmented-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 6px - (var(--segment-count) - 1) * 3px) / var(--segment-count));
  border-radius: 9px;
  background: var(--theme-bg-color);
  box-shadow: 0 1px 6px color-mix(in srgb, var(--theme-body-text) 22%, transparent);
  transform: translateX(calc(var(--segment-index) * (100% + 3px)));
  transition: transform var(--dur-slow) var(--ease-spring);
  pointer-events: none;
}

.segment {
  position: relative;
  z-index: 1;
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
  transition:
    transform var(--dur-base) var(--ease-spring),
    opacity var(--dur-fast) ease-out;
}

.segment.active {
  color: var(--theme-body-text);
  opacity: 1;
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
