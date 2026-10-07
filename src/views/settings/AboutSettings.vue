<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useUpdateCheck } from "@/composables/useUpdateCheck";
import { displayVersion } from "@/services/updateService";
import {
  previewChannelEnabled as readPreviewChannelEnabled,
  setPreviewChannelEnabled
} from "@/services/previewChannelSettings";

const { currentVersion, checking, loadCurrentVersion, manualCheck } = useUpdateCheck();

const previewChannel = ref(false);

const statusMessage = ref("");
const statusIsError = ref(false);

const versionText = computed(() => (currentVersion.value ? displayVersion(currentVersion.value) : "未知"));

onMounted(() => {
  previewChannel.value = readPreviewChannelEnabled();
  // 读不到时只是显示「未知」；原因会在用户点「检查更新」时给出。
  loadCurrentVersion().catch(() => {});
});

const onPreviewChannelChange = (enabled: boolean) => {
  previewChannel.value = enabled;
  setPreviewChannelEnabled(enabled);
};

const onCheck = async () => {
  statusMessage.value = "";
  statusIsError.value = false;

  const outcome = await manualCheck();
  if (outcome.status === "available") {
    statusMessage.value = `发现新版本 ${displayVersion(outcome.release.tag)}`;
  } else if (outcome.status === "latest") {
    statusMessage.value = "已是最新版本";
  } else if (outcome.status === "error") {
    statusMessage.value = `检查更新失败：${outcome.message}`;
    statusIsError.value = true;
  }
};

</script>

<template>
  <div class="about-settings">
    <div class="section">
      <div class="section-title">关于</div>
      <div class="config-item">
        <span class="label">当前版本 <span class="version-value">{{ versionText }}</span></span>
        <van-button class="check-btn" size="small" :loading="checking" @click="onCheck">检查更新</van-button>
      </div>
      <div class="config-item config-item--toggle">
        <div class="toggle-copy">
          <span class="label">预览版抢先体验</span>
          <p class="toggle-hint">开启后会提示预览版、测试版更新；关闭时只按稳定版检查。</p>
        </div>
        <van-switch
          :model-value="previewChannel"
          size="20px"
          @update:model-value="onPreviewChannelChange"
        />
      </div>
      <div v-if="statusMessage" class="status-hint" :class="{ error: statusIsError }">{{ statusMessage }}</div>
    </div>
  </div>
</template>

<style scoped>
.about-settings {
  padding: 0 16px;
}

.section {
  margin-bottom: 24px;
  background: var(--theme-grid-line-color); /* Fallback */
  background: color-mix(in srgb, var(--theme-grid-line-color) 15%, transparent);
  border: 1px solid var(--theme-grid-line-color); /* Fallback */
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 30%, transparent);
  border-radius: var(--theme-card-border-radius);
  overflow: hidden;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--theme-body-text);
  opacity: 0.6;
  padding: 14px 16px 6px;
}

.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}

.config-item--toggle {
  align-items: flex-start;
  gap: 12px;
  border-top: 1px solid color-mix(in srgb, var(--theme-body-text) 8%, transparent);
}

.toggle-copy {
  flex: 1;
  min-width: 0;
}

.toggle-hint {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--theme-body-text);
  opacity: 0.55;
  font-weight: 400;
}

.label {
  font-size: 14px;
  color: var(--theme-body-text);
  font-weight: 500;
}

.version-value {
  margin-left: 6px;
  font-family: 'Monaco', 'Courier New', monospace;
  font-weight: 700;
  color: var(--theme-body-text);
}

.check-btn {
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 20%, transparent);
  color: var(--theme-body-text);
}

.status-hint {
  padding: 0 16px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--theme-body-text);
  opacity: 0.7;
  word-break: break-all;
}

.status-hint.error {
  color: var(--color-danger);
  opacity: 1;
}

</style>
