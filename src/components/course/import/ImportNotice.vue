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
const lastText = ref("");
const reveal = () => {
  const text = el.value?.textContent ?? "";
  // 只在文字真的变了才动，而且是 nearest（只在真的看不见时才滚）加即时滚动：以前每次重渲染都
  // 用 smooth 滚回顶部，凡是别的状态引起一次重渲染，正在往下看的人就会被拽回去 —— 在"报告很长、
  // 用户正在滑动"的导入课表里，那表现就是滑一下就卡住。
  if (!text || text === lastText.value) return;
  lastText.value = text;
  el.value?.scrollIntoView({ block: "nearest" });
};
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
  /* 默认不可选中：同步成功那份报告可能是一屏多的文字墙，在它上面按住不动会进文字选择，
     纵向滑动就被选择手势吃掉了。只有出错那一种要能选中复制（诊断信息就在里面）。 */
  user-select: none;
  -webkit-user-select: none;
}

.notice.err {
  user-select: text;
  -webkit-user-select: text;
}

.notice.ok { --notice-accent: var(--color-success); }
.notice.err { --notice-accent: var(--color-danger); }
.notice.info { --notice-accent: var(--color-primary); }
</style>
