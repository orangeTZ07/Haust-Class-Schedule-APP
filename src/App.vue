<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useTheme } from "./composables/useTheme";
import { useUpdateCheck } from "./composables/useUpdateCheck";
import UpdateDialog from "./components/layout/UpdateDialog.vue";

const { themeConfig, cssVariables } = useTheme();
const { startAutoCheck } = useUpdateCheck();

// 版本检查在后台跑，不挡首屏；失败静默。弹窗挂在这一层，所以任何页面都能弹。
let stopAutoCheck: (() => void) | undefined;
onMounted(() => {
  stopAutoCheck = startAutoCheck();
});
onBeforeUnmount(() => stopAutoCheck?.());
</script>

<template>
  <div id="app" :class="{ dark: themeConfig.mode === 'dark' }" :style="cssVariables">
    <router-view v-slot="{ Component }">
      <transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <UpdateDialog />
  </div>
</template>

<style>
#app {
  min-height: 100vh;
  background: var(--theme-bg-color); /* 确保背景色填充 */
}

/* Pages are big surfaces: smooth, no overshoot. In with a short rise. With mode="out-in" the exit is
   dead time before the next page can start, so it stays at the shortest tier. */
.page-fade-enter-active {
  transition:
    opacity var(--dur-base) var(--ease-smooth),
    transform var(--dur-base) var(--ease-smooth);
}

.page-fade-leave-active {
  transition:
    opacity var(--dur-fast) var(--ease-exit),
    transform var(--dur-fast) var(--ease-exit);
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
