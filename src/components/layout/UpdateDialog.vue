<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "@/composables/useTheme";
import { useUpdateCheck } from "@/composables/useUpdateCheck";
import { displayVersion } from "@/services/updateService";

const { cssVariables } = useTheme();
const {
  currentVersion,
  dialogVisible,
  release,
  notes,
  actionError,
  dismissDialog,
  skipThisVersion,
  startUpdate,
  openFullNotes
} = useUpdateCheck();

const title = computed(() =>
  release.value ? `发现新版本 ${displayVersion(release.value.tag)}` : "发现新版本"
);

// 点遮罩或按返回键关掉，等同于「稍后」。
const onUpdateShow = (value: boolean) => {
  if (!value) dismissDialog();
};
</script>

<template>
  <van-popup
    :show="dialogVisible"
    @update:show="onUpdateShow"
    round
    position="center"
    class="update-popup"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.2)' }"
  >
    <div class="update-card">
      <div class="update-title">{{ title }}</div>
      <div v-if="currentVersion" class="update-current">当前版本 {{ displayVersion(currentVersion) }}</div>
      <div class="update-question">是否更新到新版本？</div>

      <div v-if="notes.groups.length" class="update-notes">
        <div v-for="group in notes.groups" :key="group.title" class="notes-group">
          <div class="notes-group-title">{{ group.title }}</div>
          <ul class="notes-list">
            <li v-for="(item, index) in group.items" :key="index">{{ item }}</li>
          </ul>
        </div>
        <div v-if="notes.hidden > 0" class="notes-more">…等 {{ notes.hidden }} 项</div>
      </div>

      <button class="full-notes-link haptics" @click="openFullNotes">查看完整更新说明</button>

      <div v-if="actionError" class="update-error">{{ actionError }}</div>

      <div class="update-actions">
        <button class="update-btn primary haptics" @click="startUpdate">立即更新</button>
        <div class="secondary-row">
          <button class="update-btn secondary haptics" @click="dismissDialog">稍后</button>
          <button class="update-btn secondary haptics" @click="skipThisVersion">跳过这个版本</button>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.update-popup {
  width: 88%;
  max-width: 340px;
  background: color-mix(in srgb, var(--theme-bg-color) 92%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.update-card {
  padding: 24px 20px 16px;
  color: var(--theme-body-text);
}

.update-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--theme-header-text);
  text-align: center;
}

.update-current {
  margin-top: 4px;
  font-size: 12px;
  text-align: center;
  opacity: 0.5;
}

.update-question {
  margin-top: 16px;
  font-size: 14px;
  line-height: 1.6;
}

.update-notes {
  margin-top: 12px;
  padding: 10px 12px;
  max-height: 40vh;
  overflow-y: auto;
  background: color-mix(in srgb, var(--theme-bg-color), var(--theme-body-text) 5%);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  border-radius: 12px;
}

.notes-group + .notes-group {
  margin-top: 10px;
}

.notes-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--theme-header-text);
  opacity: 0.8;
}

.notes-list {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.6;
}

.notes-more {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.5;
}

.full-notes-link {
  display: block;
  margin: 10px auto 0;
  padding: 4px 8px;
  border: none;
  background: none;
  font-size: 12px;
  color: var(--van-primary-color, #1989fa);
  text-decoration: underline;
}

.update-error {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-danger);
}

.update-actions {
  margin-top: 14px;
}

.update-btn {
  height: 42px;
  border: none;
  font-family: inherit;
  border-radius: 10px;
  font-size: 15px;
}

.update-btn.primary {
  width: 100%;
  font-weight: 700;
  color: #fff;
  background: var(--van-primary-color, #1989fa);
}

.secondary-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.update-btn.secondary {
  flex: 1;
  font-size: 14px;
  color: var(--theme-body-text);
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
}

.haptics:active {
  transform: scale(0.97);
  opacity: 0.8;
}
</style>
