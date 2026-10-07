<script setup lang="ts">
import { showToast } from "vant";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTheme } from "@/composables/useTheme";
import { X, MessageSquare, Gamepad2, JapaneseYen, SquareArrowOutUpRight, Copy } from '@lucide/vue';

const GITHUB_REPO_URL = "https://github.com/orangeTZ07/Haust-Class-Schedule-APP";
const GITHUB_REPO_SLUG = "orangeTZ07/Haust-Class-Schedule-APP";

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

const openGitHubRepo = async () => {
  try {
    await openUrl(GITHUB_REPO_URL);
    return;
  } catch {
    // 部分国产机 / 网页预览里 plugin-opener 会失败，再试系统窗口。
  }
  try {
    const opened = window.open(GITHUB_REPO_URL, "_blank", "noopener");
    if (opened) return;
  } catch {
    // ignore and toast below
  }
  showToast({ message: "打不开浏览器，请点复制", type: "fail" });
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
        <div class="contact-item" @click="copyToClipboard('1045863590', '群号')">
          <div class="item-icon-box">
            <MessageSquare :size="20" class="item-icon" />
          </div>
          <div class="item-info">
            <div class="item-label">提出建议</div>
            <div class="item-value">QQ群：1045863590</div>
          </div>
          <button class="mini-copy-btn" aria-label="复制群号" @click.stop="copyToClipboard('1045863590', '群号')">
            <Copy :size="14" />
          </button>
        </div>

        <!-- 一起玩MC -->
        <div class="contact-item" @click="copyToClipboard('1064240287', '群号')">
          <div class="item-icon-box">
            <Gamepad2 :size="20" class="item-icon" />
          </div>
          <div class="item-info">
            <div class="item-label">一起玩MC</div>
            <div class="item-value">QQ群：1064240287</div>
          </div>
          <button class="mini-copy-btn" aria-label="复制群号" @click.stop="copyToClipboard('1064240287', '群号')">
            <Copy :size="14" />
          </button>
        </div>

        <!-- ？！给我充Q币！？ -->
        <div class="contact-item" @click="copyToClipboard('776935834', '群号')">
          <div class="item-icon-box">
            <JapaneseYen :size="20" class="item-icon" />
          </div>
          <div class="item-info">
            <div class="item-label">？！给我充Q币！？</div>
            <div class="item-value">QQ群：776935834</div>
          </div>
          <button class="mini-copy-btn" aria-label="复制群号" @click.stop="copyToClipboard('776935834', '群号')">
            <Copy :size="14" />
          </button>
        </div>

        <!-- GitHub 仓库 -->
        <div class="contact-item" @click="openGitHubRepo">
          <div class="item-icon-box">
            <!-- lucide 1.14 / Vant 都没有 GitHub 商标图标，用官方 mark 的 inline SVG。 -->
            <svg class="item-icon github-mark" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
              />
            </svg>
          </div>
          <div class="item-info">
            <div class="item-label">GitHub 仓库</div>
            <div class="item-value">{{ GITHUB_REPO_SLUG }}</div>
          </div>
          <div class="item-actions">
            <button class="mini-copy-btn" aria-label="打开仓库" @click.stop="openGitHubRepo">
              <SquareArrowOutUpRight :size="14" />
            </button>
            <button class="mini-copy-btn" aria-label="复制仓库地址" @click.stop="copyToClipboard(GITHUB_REPO_URL, '仓库地址')">
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
.card-sections {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--theme-bg-color), var(--theme-body-text) 5%);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  border-radius: 12px;
  cursor: pointer;
  transition: transform var(--dur-fast, 0.15s) ease, background var(--dur-fast, 0.15s) ease;
}

.contact-item:active {
  transform: scale(0.98);
}

.item-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  color: var(--theme-accent);
  flex-shrink: 0;
}

.item-icon {
  flex-shrink: 0;
}

.github-mark {
  display: block;
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
  overflow-wrap: anywhere;
  line-height: 1.35;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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
