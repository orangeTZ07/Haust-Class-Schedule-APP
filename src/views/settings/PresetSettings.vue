<script setup lang="ts">
import { useTheme, presetList } from "@/composables/useTheme";
import { useRouter } from "vue-router";
import { ArrowLeft, Check } from '@lucide/vue';

const router = useRouter();
const {
  currentPresetId,
  applyPresetById
} = useTheme();

const goBack = () => {
  router.back();
};

const handleSelect = (id: string) => {
  applyPresetById(id);
};
</script>

<template>
  <div class="preset-settings">
    <div class="settings-header">
      <div class="header-left">
        <div class="back-btn" @click="goBack">
          <ArrowLeft :size="20" />
        </div>
        <span class="title">主题预设</span>
      </div>
    </div>

    <div class="content">
      <div class="preset-list">
        <div
          v-for="preset in presetList"
          :key="preset.id"
          class="preset-item"
          :class="{ active: preset.id === currentPresetId }"
          @click="handleSelect(preset.id)"
        >
          <div class="preset-preview" :style="{ background: preset.preset.bgColor }">
            <div class="p-header" :style="{ background: preset.preset.headerBgColor }"></div>
            <div class="p-card" :style="{ background: preset.preset.headerBgColor, opacity: preset.preset.cardOpacity/100 }"></div>
          </div>
          <div class="preset-name">{{ preset.name }}</div>
          <div class="active-tag" v-if="preset.id === currentPresetId">
            <Check :size="16" stroke-width="3" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preset-settings {
  min-height: 100vh;
  background: var(--theme-bg-color);
  color: var(--theme-body-text);
}

.settings-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--theme-bg-color);
  padding: 16px;
  padding-top: calc(16px + env(safe-area-inset-top, 0px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  padding: 4px;
  cursor: pointer;
  opacity: 0.7;
}

.title {
  font-size: 17px;
  font-weight: 600;
}

.content {
  padding: 20px;
}

.preset-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.preset-item {
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--theme-bg-color) 94%, var(--theme-body-text));
  border: 1px solid transparent;
  cursor: pointer;
  position: relative;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.preset-item:active {
  transform: scale(0.96);
}

.preset-item.active {
  border-color: color-mix(in srgb, var(--theme-body-text) 30%, transparent);
  background: var(--theme-bg-color);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.preset-preview {
  height: 80px;
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  display: flex;
  flex-direction: column;
}

.preset-preview .p-header {
  height: 16px;
  width: 100%;
}

.preset-preview .p-card {
  width: 40px;
  height: 30px;
  margin: 15px auto;
  border-radius: 4px;
}

.preset-name {
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.active-tag {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--color-primary);
}
</style>
