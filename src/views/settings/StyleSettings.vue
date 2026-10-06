<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useTheme, presetList } from "@/composables/useTheme";
import { useRouter } from "vue-router";
import { ArrowLeft, ChevronRight, Palette, Image as ImageIcon, Sliders } from '@lucide/vue';
import ImageCropper from "@/components/common/ImageCropper.vue";
import ColorWheelPicker from "@/components/common/ColorWheelPicker.vue";

const router = useRouter();
const {
  themeConfig,
  currentPresetId,
  updateConfig,
  setBgImage,
  clearBgImage
} = useTheme();

const fileInputRef = ref<HTMLInputElement | null>(null);

/// Back to wherever the user came from: this page is reached from 设置 now, but a stale link or a
/// reload can land here with nothing behind it, and router.back() would then leave the app.
/// vue-router keeps the previous route in history.state.back for exactly this check.
const goBack = () => {
  if (window.history.state?.back) {
    router.back();
  } else {
    router.push("/settings");
  }
};

const goToPresets = () => {
  router.push("/style/presets");
};

/// The colour items open a colour wheel instead of the system picker. While it is open the colour
/// is only previewed, as an inline CSS variable on this page: nothing is stored (and the theme,
/// possibly carrying a megabyte of background image, is not re-saved on every drag frame) until
/// 确定, and 取消 simply removes the override.
const colorItems = {
  bgColor: { label: "背景颜色", cssVar: "--theme-bg-color" },
  gridLineColor: { label: "网格线色彩", cssVar: "--theme-grid-line-color" },
  headerBgColor: { label: "页眉背景色", cssVar: "--theme-header-bg" },
} as const;
type ColorKey = keyof typeof colorItems;

const pageEl = ref<HTMLElement | null>(null);
const pickerOpen = ref(false);
const pickingKey = ref<ColorKey>("bgColor");

const openColorPicker = (key: ColorKey) => {
  pickingKey.value = key;
  pickerOpen.value = true;
};

const previewColor = (hex: string) => {
  pageEl.value?.style.setProperty(colorItems[pickingKey.value].cssVar, hex);
};

const endColorPreview = () => {
  pageEl.value?.style.removeProperty(colorItems[pickingKey.value].cssVar);
};

const confirmColor = (hex: string) => {
  updateConfig(pickingKey.value, hex);
  // Drop the override only once the theme has re-rendered with the new value, or the old
  // colour would show for a frame.
  nextTick(endColorPreview);
};

/// Picking a file no longer applies it: the cropper opens first and only its 完成 sets the
/// background, so 取消 leaves the current one untouched.
const cropFile = ref<File | null>(null);

const handleImageUpload = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  // Clear the input so picking the same picture again still fires `change`.
  target.value = "";
  if (file) cropFile.value = file;
};

const handleCropConfirm = (dataUrl: string) => {
  setBgImage(dataUrl);
  cropFile.value = null;
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
  <div ref="pageEl" class="style-settings">
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
          <button
            type="button"
            class="color-picker-wrapper"
            :style="{ background: themeConfig.bgColor }"
            aria-label="选择背景颜色"
            @click="openColorPicker('bgColor')"
          />
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
            <button
              type="button"
              class="color-picker-wrapper"
              :style="{ background: themeConfig.gridLineColor }"
              aria-label="选择网格线色彩"
              @click="openColorPicker('gridLineColor')"
            />
          </div>
          <div class="color-item-row">
            <span class="color-label">页眉背景色</span>
            <button
              type="button"
              class="color-picker-wrapper"
              :style="{ background: themeConfig.headerBgColor }"
              aria-label="选择页眉背景色"
              @click="openColorPicker('headerBgColor')"
            />
          </div>
        </div>
      </div>
    </div>

    <ImageCropper :file="cropFile" @confirm="handleCropConfirm" @cancel="cropFile = null" />

    <ColorWheelPicker
      v-model:show="pickerOpen"
      :title="colorItems[pickingKey].label"
      :color="themeConfig[pickingKey]"
      @preview="previewColor"
      @confirm="confirmColor"
      @cancel="endColorPreview"
    />
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
  padding-top: calc(16px + var(--safe-top));
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
  transition:
    transform var(--dur-base) var(--ease-spring),
    background-color var(--dur-fast) ease-out;
}

.card.clickable:active {
  background: color-mix(in srgb, var(--theme-header-bg) 5%, transparent);
  transform: scale(0.98);
  transition-duration: 90ms, var(--dur-fast);
  transition-timing-function: ease-out;
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

/* The colour swatch is a button now; it reuses .color-picker-wrapper for its circle. */
button.color-picker-wrapper {
  padding: 0;
  cursor: pointer;
  appearance: none;
}
</style>