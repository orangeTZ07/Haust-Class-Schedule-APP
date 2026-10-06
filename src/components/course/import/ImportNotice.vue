<script setup lang="ts">
import { onMounted, onUpdated, ref } from "vue";

defineProps<{
  kind: "ok" | "err" | "info";
}>();

const el = ref<HTMLElement | null>(null);

/// A result is usually triggered by a button further down the form. If the sheet was scrolled, the
/// message would appear above the visible part and the tap would look like it did nothing -- the
/// same reason the old panel put results at the very top, but that only helps while the user is
/// still at the top. So bring it into view whenever it appears or its text changes.
const reveal = () => el.value?.scrollIntoView({ block: "start", behavior: "smooth" });
onMounted(reveal);
onUpdated(reveal);
</script>

<template>
  <div ref="el" class="notice" :class="kind" role="status">
    <slot />
  </div>
</template>

<style scoped>
.notice {
  padding: 11px 14px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--theme-body-text);
  border-radius: 10px;
  border-left: 3px solid var(--notice-accent);
  background: color-mix(in srgb, var(--notice-accent) 13%, transparent);
  /* The failure text can carry multi-line diagnostics, and the user is asked to copy it, so keep
     the line breaks and let it be selected. Long URLs wrap instead of widening the sheet. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
  -webkit-user-select: text;
}

.notice.ok { --notice-accent: var(--color-success); }
.notice.err { --notice-accent: var(--color-danger); }
.notice.info { --notice-accent: var(--color-primary); }
</style>
