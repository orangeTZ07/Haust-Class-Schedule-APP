<script setup lang="ts">
import { ref } from "vue";
import { useTheme } from "@/composables/useTheme";

const {
  themeConfig,
  updateConfig,
  setBgImage,
  clearBgImage
} = useTheme();

const fileInputRef = ref<HTMLInputElement | null>(null);

const handleColorChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  updateConfig('bgColor', target.value);
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
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
  });
};

const handleImageUpload = (e: Event) => {
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
  <div class="bg-settings">
    <div class="section">
      <div class="section-title">背景颜色</div>
      <div class="color-picker-row">
        <input
          type="color"
          :value="themeConfig.bgColor"
          @input="handleColorChange"
          class="color-input"
        />
        <span class="color-value">{{ themeConfig.bgColor }}</span>
      </div>
      <div class="preset-colors">
        <div
          v-for="color in presetColors"
          :key="color"
          class="preset-color"
          :style="{ background: color }"
          @click="updateConfig('bgColor', color)"
        />
      </div>
    </div>

    <div class="section">
      <div class="section-title">背景图片</div>
      <div class="image-upload">
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          @change="handleImageUpload"
          style="display: none"
        />
        <van-button size="small" @click="triggerUpload">选择图片</van-button>
        <van-button
          v-if="themeConfig.bgImage"
          size="small"
          type="danger"
          @click="clearBgImage"
        >
          清除图片
        </van-button>
      </div>
      <div v-if="themeConfig.bgImage" class="image-preview">
        <img :src="themeConfig.bgImage" alt="背景预览" />
      </div>
    </div>

    <div class="section" v-if="themeConfig.bgImage">
      <div class="section-title">图片不透明度</div>
      <div class="config-item">
        <van-slider
          :model-value="themeConfig.bgImageOpacity"
          @update:model-value="(v: number) => updateConfig('bgImageOpacity', v)"
          :min="0"
          :max="100"
          :step="5"
        />
        <span class="value">{{ themeConfig.bgImageOpacity }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bg-settings {
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

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.color-input {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.color-value {
  font-size: 13px;
  color: var(--theme-body-text);
  font-family: monospace;
}

.preset-colors {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preset-color {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 2px solid var(--theme-grid-line-color);
  cursor: pointer;
  transition: transform 0.15s;
}

.preset-color:hover {
  transform: scale(1.1);
}

.image-upload {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.image-preview {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--theme-grid-line-color);
}

.image-preview img {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
}

.config-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.value {
  min-width: 40px;
  text-align: right;
  font-size: 13px;
  color: var(--theme-body-text);
}
</style>
