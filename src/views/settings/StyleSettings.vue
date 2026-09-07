<script setup lang="ts">
import { ref } from "vue";
import { useTheme, presetList } from "@/composables/useTheme";
import { useRouter } from "vue-router";
import { ArrowLeft, ChevronRight, Palette, Image as ImageIcon, Sliders } from '@lucide/vue';

const router = useRouter();
const {
  themeConfig,
  currentPresetId,
  updateConfig,
  setBgImage,
  clearBgImage
} = useTheme();

const fileInputRef = ref<HTMLInputElement | null>(null);

const goBack = () => {
  router.push("/");
};

const goToPresets = () => {
  router.push("/style/presets");
};

const handleColorChange = (key: string, e: Event) => {
  const target = e.target as HTMLInputElement;
  updateConfig(key as any, target.value);
};

const compressImage = (dataUrl: string, maxWidth = 1280): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);
      // 使用 JPEG 压缩提高效率，质量 0.7
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
  });
};

const handleImageUpload = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const dataUrl = event.target?.result as string;
    const compressed = await compressImage(dataUrl);
    setBgImage(compressed);
  };
  reader.readAsDataURL(file);
};

const triggerUpload = () => {
  fileInputRef.value?.click();
};

const presetColors = [
  "#ffffff", "#f5f5f5", "#e8e8e8", "#d0d0d0",
  "#121212", "#1a1a1a", "#2d2d2d", "#3d3d3d"
];
</script>

<template>
  <div class="style-settings">
    <div class="settings-header">
      <div class="header-left">
        <div class="back-btn" @click="goBack">
          <ArrowLeft :size="20" />
        </div>
        <span class="title">界面美化</span>
      </div>
    </div>

    <div class="content">
      <!-- 预设选择入口：跳转到预设页面 -->
      <div class="card clickable" @click="goToPresets">
        <div class="card-icon">
          <Palette :size="20" stroke-width="1.5" />
        </div>
        <div class="card-info">
          <div class="card-title">主题预设</div>
        </div>
        <div class="card-value">
          {{ presetList.find(p => p.id === currentPresetId)?.name || '自定义' }}
        </div>
        <ChevronRight :size="18" class="arrow" />
      </div>

      <!-- 背景设置 -->
      <div class="section-title">背景</div>
      <div class="section">
        <div class="config-item">
          <span class="label">背景颜色</span>
          <div class="color-picker-wrapper">
            <input
              type="color"
              :value="themeConfig.bgColor"
              @input="(e) => handleColorChange('bgColor', e)"
              class="color-input"
            />
          </div>
        </div>

        <div class="preset-colors">
          <div
            v-for="color in presetColors"
            :key="color"
            class="preset-color"
            :style="{ background: color }"
            @click="updateConfig('bgColor', color)"
          >
            <div class="active-dot" v-if="themeConfig.bgColor === color"></div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="config-item">
          <span class="label">背景图片</span>
          <div class="image-actions">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              @change="handleImageUpload"
              style="display: none"
            />
            <van-button size="small" round class="reset-btn" @click="triggerUpload">更换</van-button>
            <van-button
              v-if="themeConfig.bgImage"
              size="small"
              round
              class="reset-btn danger"
              @click="clearBgImage"
            >
              移除
            </van-button>
          </div>
        </div>

        <div v-if="themeConfig.bgImage">
          <div class="config-item slider-item">
            <span class="label">图片不透明度</span>
            <div class="slider-group">
              <van-slider
                :model-value="themeConfig.bgImageOpacity"
                @update:model-value="(v: number) => updateConfig('bgImageOpacity', v)"
                :min="0"
                :max="100"
                bar-height="2px"
              />
              <span class="unit">{{ themeConfig.bgImageOpacity }}%</span>
            </div>
          </div>

          <div class="config-item slider-item">
            <span class="label">毛玻璃模糊</span>
            <div class="slider-group">
              <van-slider
                :model-value="themeConfig.bgBlur"
                @update:model-value="(v: number) => updateConfig('bgBlur', v)"
                :min="0"
                :max="40"
                :step="1"
                bar-height="2px"
              />
              <span class="unit">{{ themeConfig.bgBlur }}px</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 高级微调 -->
      <div class="section-title">高级调节</div>
      <div class="section">
        <div class="config-item slider-item">
          <span class="label">卡片不透明度</span>
          <div class="slider-group">
            <van-slider
              :model-value="themeConfig.cardOpacity"
              @update:model-value="(v: number) => updateConfig('cardOpacity', v)"
              :min="5"
              :max="100"
              bar-height="2px"
            />
            <span class="unit">{{ themeConfig.cardOpacity }}%</span>
          </div>
        </div>

        <div class="config-item slider-item">
          <span class="label">圆角大小</span>
          <div class="slider-group">
            <van-slider
              :model-value="themeConfig.cardBorderRadius"
              @update:model-value="(v: number) => updateConfig('cardBorderRadius', v)"
              :min="0"
              :max="24"
              bar-height="2px"
            />
            <span class="unit">{{ themeConfig.cardBorderRadius }}px</span>
          </div>
        </div>

        <div class="divider"></div>
        
        <div class="config-grid">
          <div class="color-item-row" @click.self>
            <span class="color-label">网格线色彩</span>
            <input type="color" :value="themeConfig.gridLineColor" @input="(e) => handleColorChange('gridLineColor', e)" />
          </div>
          <div class="color-item-row">
            <span class="color-label">页眉背景色</span>
            <input type="color" :value="themeConfig.headerBgColor" @input="(e) => handleColorChange('headerBgColor', e)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.style-settings {
  min-height: 100vh;
  background: var(--theme-bg-color);
  color: var(--theme-body-text);
  padding-bottom: 40px;
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
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 统一卡片样式 */
.section {
  background: color-mix(in srgb, var(--theme-grid-line-color) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 30%, transparent);
  border-radius: var(--theme-card-border-radius);
  overflow: hidden;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.card.clickable {
  background: color-mix(in srgb, var(--theme-grid-line-color) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 30%, transparent);
  border-radius: var(--theme-card-border-radius);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.card.clickable:active {
  background: color-mix(in srgb, var(--theme-header-bg) 5%, transparent);
}

.card-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
}

.card-info {
  flex: 1;
}

.card-title {
  font-size: 14px;
  font-weight: 500;
}

.card-value {
  font-size: 13px;
  opacity: 0.5;
}

.arrow {
  opacity: 0.2;
}

/* 分块标题 */
.section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--theme-body-text);
  opacity: 0.6;
  padding: 4px 0 8px 4px;
}

.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 20%, transparent);
}

.config-item:last-child {
  border-bottom: none;
}

.slider-item {
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.label {
  font-size: 14px;
  color: var(--theme-body-text);
  font-weight: 500;
}

.color-picker-wrapper {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, var(--theme-body-text) 20%, transparent);
}

.color-input {
  width: 200%;
  height: 200%;
  margin: -50%;
  border: none;
  cursor: pointer;
}

.preset-colors {
  display: flex;
  gap: 12px;
  padding: 4px 16px 16px;
  flex-wrap: wrap;
}

.preset-color {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.active-dot {
  width: 6px;
  height: 6px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 0 2px rgba(0,0,0,0.5);
}

.divider {
  height: 1px;
  background: color-mix(in srgb, var(--theme-grid-line-color) 20%, transparent);
}

.image-actions {
  display: flex;
  gap: 8px;
}

.reset-btn {
  height: 26px;
  padding: 0 12px;
  font-size: 11px;
  background: var(--theme-header-bg); /* Fallback */
  background: color-mix(in srgb, var(--theme-header-bg) 15%, transparent);
  border: 1px solid var(--theme-grid-line-color); /* Fallback */
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
  color: var(--theme-header-text);
}

.reset-btn.danger {
  color: #ee0a24;
}

.slider-group {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
}

.unit {
  font-size: 12px;
  opacity: 0.5;
  min-width: 36px;
  text-align: right;
  font-family: monospace;
}

.config-grid {
  display: flex;
  flex-direction: column;
}

.color-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 20%, transparent);
}

.color-item-row:last-child {
  border-bottom: none;
}

.color-label {
  font-size: 14px;
  opacity: 0.8;
}

.color-item-row input[type="color"] {
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  cursor: pointer;
}

:deep(.van-slider__button) {
  width: 14px;
  height: 14px;
  background-color: var(--theme-header-text);
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

:deep(.van-slider__bar) {
  background-color: var(--theme-header-text) !important;
}
</style>