<script setup lang="ts">
import { useRouter } from "vue-router";
import { ArrowLeft, ChevronRight, Palette } from '@lucide/vue';
import GridSettings from "./settings/GridSettings.vue";
import AboutSettings from "./settings/AboutSettings.vue";
import { presetList, useTheme } from "@/composables/useTheme";

const router = useRouter();
const { currentPresetId } = useTheme();

const goBack = () => {
  router.push("/");
};
</script>

<template>
  <div class="settings-view">
    <div class="settings-header">
      <ArrowLeft :size="20" @click="goBack" class="back-btn" />
      <span class="title">设置</span>
    </div>

    <div class="content">
      <!-- 样式调整以前在侧栏里，现在归到设置下面，和别的设置放在一起找 -->
      <div class="entry-card" @click="router.push('/style')">
        <Palette :size="20" stroke-width="1.5" class="entry-icon" />
        <div class="entry-text">
          <div class="entry-title">外观样式</div>
          <div class="entry-sub">主题、背景图片、圆角</div>
        </div>
        <div class="entry-value">
          {{ presetList.find(p => p.id === currentPresetId)?.name || '自定义' }}
        </div>
        <ChevronRight :size="18" class="entry-arrow" />
      </div>

      <GridSettings />
      <AboutSettings />
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  background: var(--theme-bg-color);
}

.settings-header {
  display: flex;
  align-items: center;
  padding: 16px;
  padding-top: calc(16px + var(--safe-top));
  background: var(--theme-header-bg);
  border-bottom: 1px solid var(--theme-grid-line-color);
}

.back-btn {
  cursor: pointer;
  color: var(--theme-header-text);
  margin-right: 12px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-header-text);
}

.content {
  padding-bottom: 80px;
}

/* Same card look as the sections in GridSettings, so the row reads as one more setting. The 12px
   above it plus GridSettings' own 12px of top padding give the gap between the two. */
.entry-card {
  margin: 12px 16px 0;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  background: color-mix(in srgb, var(--theme-grid-line-color) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 30%, transparent);
  border-radius: var(--theme-card-border-radius);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition:
    transform var(--dur-base) var(--ease-spring),
    background-color var(--dur-fast) ease-out;
}

/* A wide row sinks less than a button: 0.96 of a full-width card is a visible lurch. */
.entry-card:active {
  background: color-mix(in srgb, var(--theme-header-bg) 5%, transparent);
  transform: scale(0.98);
  transition-duration: 90ms, var(--dur-fast);
  transition-timing-function: ease-out;
}

.entry-icon {
  flex-shrink: 0;
  color: var(--theme-body-text);
  opacity: 0.7;
}

.entry-text {
  flex: 1;
  min-width: 0;
}

.entry-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-body-text);
}

.entry-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--theme-body-text);
  opacity: 0.5;
}

.entry-value {
  font-size: 13px;
  color: var(--theme-body-text);
  opacity: 0.5;
}

.entry-arrow {
  color: var(--theme-body-text);
  opacity: 0.25;
}
</style>
