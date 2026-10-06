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

const { cssVariables } = useTheme();

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
    class="app-popup app-popup--center"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.2)' }"
  >
    <div class="app-popup-card">
      <button class="app-popup-close" aria-label="关闭" @click="emit('update:show', false)">
        <X :size="16" />
      </button>

      <h2 class="app-popup-title">联系开发者</h2>

      <div class="card-sections">
        <!-- 提出建议 -->
        <div class="contact-item">
          <MessageSquare :size="22" class="item-icon suggestion" />
          <div class="item-info">
            <div class="item-label">提出建议</div>
            <div class="item-value">QQ群：1045863590</div>
          </div>
          <button class="mini-copy-btn" aria-label="复制群号" @click="copyToClipboard('1045863590', '群号')">
            <Copy :size="14" />
          </button>
        </div>

        <!-- 一起玩MC -->
        <div class="contact-item">
          <Gamepad2 :size="22" class="item-icon mc" />
          <div class="item-info">
            <div class="item-label">一起玩MC</div>
            <div class="item-value">QQ群：1064240287</div>
          </div>
          <button class="mini-copy-btn" aria-label="复制群号" @click="copyToClipboard('1064240287', '群号')">
            <Copy :size="14" />
          </button>
        </div>
      </div>

      <div class="card-footer">
        期待你的加入与反馈 ❤️
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.card-sections {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  background: color-mix(in srgb, var(--theme-bg-color), var(--theme-body-text) 5%);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  border-radius: 12px;
}

.item-icon {
  flex-shrink: 0;
  opacity: 0.9;
}

.item-icon.suggestion {
  color: #007AFF;
}

.item-icon.mc {
  color: #4CAF50;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-body-text);
  margin-bottom: 2px;
}

.item-value {
  font-size: 12px;
  opacity: 0.6;
}

.mini-copy-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--theme-body-text) 7%, transparent);
  color: var(--theme-body-text);
  opacity: 0.75;
}

.card-footer {
  margin-top: 18px;
  text-align: center;
  font-size: 11px;
  opacity: 0.4;
  letter-spacing: 0.5px;
}
</style>
