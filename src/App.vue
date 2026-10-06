<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useTheme } from "./composables/useTheme";
import { useSystemBars } from "./composables/useSystemBars";
import { useUpdateCheck } from "./composables/useUpdateCheck";
import UpdateDialog from "./components/layout/UpdateDialog.vue";

const { themeConfig, cssVariables } = useTheme();
// 把安卓状态栏 / 导航栏的真实尺寸写进 --native-safe-*，并让栏上的图标颜色跟着主题走；失败静默。
useSystemBars();
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

.page-fade-enter-active,
.page-fade-leave-active {
  transition: all 0.125s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-fade-enter-from {
  opacity: 0;
  transform: scale(0.99);
}

.page-fade-leave-to {
  opacity: 0;
  transform: scale(1.01);
}
</style>
