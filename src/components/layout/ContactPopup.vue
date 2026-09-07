<script setup lang="ts">
import { showToast } from "vant";
import { useTheme } from "@/composables/useTheme";
import { X, MessageSquare, Gamepad2, Copy } from '@lucide/vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

const { cssVariables, isDark } = useTheme();

const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    showToast({ message: `${label}已复制`, type: "success", position: "bottom" });
  } catch (e) {
    showToast({ message: "复制失败", type: "fail" });
  }
};
</script>

<template>
  <van-popup
    :show="props.show"
    @update:show="val => emit('update:show', val)"
    round
    position="center"
    class="custom-contact-popup"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.2)' }"
  >
    <div class="minimal-contact-card" :class="{ 'is-dark': isDark }">
      <button class="minimal-close-btn haptics" @click="emit('update:show', false)">
        <X :size="16" />
      </button>

      <div class="card-title">联系开发者</div>
      
      <div class="card-sections">
        <!-- 提出建议 -->
        <div class="contact-item">
          <div class="item-header">
            <MessageSquare :size="22" class="item-icon suggestion" />
            <div class="item-info">
              <div class="item-label">提出建议</div>
              <div class="item-value">QQ群：1045863590</div>
            </div>
            <button class="mini-copy-btn haptics" @click="copyToClipboard('1045863590', '群号')">
              <Copy :size="14" />
            </button>
          </div>
        </div>

        <!-- 一起玩MC -->
        <div class="contact-item">
          <div class="item-header">
            <Gamepad2 :size="22" class="item-icon mc" />
            <div class="item-info">
              <div class="item-label">一起玩MC</div>
              <div class="item-value">QQ群：1064240287</div>
            </div>
            <button class="mini-copy-btn haptics" @click="copyToClipboard('1064240287', '群号')">
              <Copy :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div class="card-footer">
        期待你的加入与反馈 ❤️
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.custom-contact-popup {
  width: 85%;
  max-width: 320px;
  background: color-mix(in srgb, var(--theme-bg-color) 85%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.minimal-contact-card {
  padding: 32px 24px 24px;
  color: var(--theme-body-text);
}

.minimal-close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  color: var(--theme-body-text);
  opacity: 0.6;
}

.card-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 24px;
  color: var(--theme-header-text);
  text-align: center;
}

.card-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.contact-item {
  background: color-mix(in srgb, var(--theme-bg-color), var(--theme-body-text) 5%);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  border-radius: 12px;
  padding: 12px;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.item-icon {
  opacity: 0.8;
}

.item-icon.suggestion {
  color: #007AFF;
}

.item-icon.mc {
  color: #4CAF50;
}

.item-info {
  flex: 1;
}

.item-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-header-text);
  margin-bottom: 2px;
}

.item-value {
  font-size: 12px;
  opacity: 0.6;
}

.mini-copy-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  color: var(--theme-body-text);
  opacity: 0.7;
}

.card-footer {
  margin-top: 24px;
  text-align: center;
  font-size: 11px;
  opacity: 0.4;
  letter-spacing: 0.5px;
}

.haptics:active {
  transform: scale(0.96);
  opacity: 0.8;
}
</style>
