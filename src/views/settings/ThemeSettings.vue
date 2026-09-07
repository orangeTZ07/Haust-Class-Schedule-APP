<script setup lang="ts">
import { useTheme } from "@/composables/useTheme";
import { Sun, Moon } from '@lucide/vue';

const {
  themeConfig,
  isDark,
  toggleMode,
  applyVantBluePreset,
  applyCatppuccinLattePreset,
  applyDarkPreset,
  updateConfig
} = useTheme();
</script>

<template>
  <div class="theme-settings">
    <div class="section">
      <div class="section-title">模式</div>
      <div class="mode-switch">
        <div
          class="mode-btn"
          :class="{ active: !isDark }"
          @click="isDark && toggleMode()"
        >
          <Sun :size="24" />
          <span>亮色</span>
        </div>
        <div
          class="mode-btn"
          :class="{ active: isDark }"
          @click="!isDark && toggleMode()"
        >
          <Moon :size="24" />
          <span>暗色</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">预设</div>
      <div class="presets">
        <van-button size="small" @click="applyCatppuccinLattePreset">Catppuccin Latte</van-button>
        <van-button size="small" @click="applyVantBluePreset">Vant 蓝</van-button>
        <van-button size="small" @click="applyDarkPreset">Catppuccin Mocha</van-button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">卡片样式</div>

      <div class="config-item">
        <span class="label">不透明度</span>
        <van-slider
          :model-value="themeConfig.cardOpacity"
          @update:model-value="(v: number) => updateConfig('cardOpacity', v)"
          :min="0"
          :max="100"
          :step="5"
        />
        <span class="value">{{ themeConfig.cardOpacity }}%</span>
      </div>

      <div class="config-item">
        <span class="label">边框粗细</span>
        <van-slider
          :model-value="themeConfig.cardBorderWidth"
          @update:model-value="(v: number) => updateConfig('cardBorderWidth', v)"
          :min="0"
          :max="3"
          :step="1"
        />
        <span class="value">{{ themeConfig.cardBorderWidth }}px</span>
      </div>

      <div class="config-item">
        <span class="label">圆角</span>
        <van-slider
          :model-value="themeConfig.cardBorderRadius"
          @update:model-value="(v: number) => updateConfig('cardBorderRadius', v)"
          :min="0"
          :max="20"
          :step="1"
        />
        <span class="value">{{ themeConfig.cardBorderRadius }}px</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.theme-settings {
  padding: 16px;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-body-text);
  margin-bottom: 12px;
}

.mode-switch {
  display: flex;
  gap: 12px;
}

.mode-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border: 2px solid var(--theme-grid-line-color);
  border-radius: 8px;
  cursor: pointer;
  color: var(--theme-body-text);
  transition: all 0.2s;
}

.mode-btn.active {
  border-color: var(--color-primary);
  background: rgba(25, 137, 250, 0.1);
}

.presets {
  display: flex;
  gap: 12px;
}

.config-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.label {
  min-width: 70px;
  font-size: 13px;
  color: var(--theme-body-text);
}

.value {
  min-width: 40px;
  text-align: right;
  font-size: 13px;
  color: var(--theme-body-text);
}
</style>
