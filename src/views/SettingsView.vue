<script setup lang="ts">
import { useRouter } from "vue-router";
import { ArrowLeft } from '@lucide/vue';
import GridSettings from "./settings/GridSettings.vue";

const router = useRouter();

const goBack = () => {
  router.push("/");
};
</script>

<template>
  <div class="settings-view">
    <div class="settings-header">
      <ArrowLeft :size="20" @click="goBack" class="back-btn" />
      <span class="title">设置</span>
    </div>

    <div class="content">
      <GridSettings />
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  background: var(--theme-bg-color);
}

.settings-header {
  display: flex;
  align-items: center;
  padding: 16px;
  padding-top: calc(16px + env(safe-area-inset-top, 0px));
  background: var(--theme-header-bg);
  border-bottom: 1px solid var(--theme-grid-line-color);
}

.back-btn {
  cursor: pointer;
  color: var(--theme-header-text);
  margin-right: 12px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-header-text);
}

.content {
  padding-bottom: 80px;
}
</style>
