<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "@/composables/useTheme";
import { useUpdateCheck } from "@/composables/useUpdateCheck";
import { displayVersion, updateOfferTitle } from "@/services/updateService";

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
  release.value ? updateOfferTitle(release.value.tag) : "发现新版本"
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
    class="app-popup app-popup--center"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.2)' }"
  >
    <div class="app-popup-card">
      <h2 class="app-popup-title update-title">{{ title }}</h2>
      <div v-if="currentVersion" class="app-popup-sub">当前版本 {{ displayVersion(currentVersion) }}</div>
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
        <button class="app-btn app-btn--primary" @click="startUpdate">立即更新</button>
        <div class="secondary-row">
          <button class="app-btn" @click="dismissDialog">稍后</button>
          <button class="app-btn" @click="skipThisVersion">跳过这个版本</button>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
/* No close button on this card (稍后 is the way out), so the title does not need to leave room. */
.update-title {
  padding-right: 0;
}

.update-question {
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
  color: var(--theme-body-text);
  opacity: 0.8;
}

.notes-list {
  margin: 4px 0 0;
  padding-left: 18px;
  /* Vant's reset strips list markers, which left the items indented with nothing in the gutter. */
  list-style: disc;
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

.secondary-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.secondary-row .app-btn {
  flex: 1;
  font-size: 14px;
}
</style>
