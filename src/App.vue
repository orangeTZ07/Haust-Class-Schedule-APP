<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useCourses } from "./composables/useCourses";
import { useTheme } from "./composables/useTheme";
import { useSystemBars } from "./composables/useSystemBars";
import { useUpdateCheck } from "./composables/useUpdateCheck";
import { MAX_SPLASH_MS, hideAppSplash } from "./utils/splash";
import UpdateDialog from "./components/layout/UpdateDialog.vue";

const { themeConfig, cssVariables, metalShine, neonFx } = useTheme();
// 把安卓状态栏 / 导航栏的真实尺寸写进 --native-safe-*，并让栏上的图标颜色跟着主题走；失败静默。
useSystemBars();
const { startAutoCheck } = useUpdateCheck();
// 首屏数据由 useCourses 在模块加载时就开始读（coursesReady 是模块级 Promise）。
const { coursesReady } = useCourses();

// 版本检查在后台跑，不挡首屏；失败静默。弹窗挂在这一层，所以任何页面都能弹。
let stopAutoCheck: (() => void) | undefined;
onMounted(() => {
  stopAutoCheck = startAutoCheck();

  // 启动屏（index.html 里内联的 #app-splash）等首屏课表数据到位再淡出：先露一张空网格、
  // 几百毫秒后课程再跳出来，比多等这一会儿更难看。读库失败或卡住时由 MAX_SPLASH_MS 兜底。
  void Promise.race([
    coursesReady.catch(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, MAX_SPLASH_MS)),
  ]).then(() => hideAppSplash());
});
onBeforeUnmount(() => stopAutoCheck?.());
</script>

<template>
  <div
    id="app"
    :class="{
      dark: themeConfig.mode === 'dark',
      'metal-shine-silver': metalShine === 'silver',
      'metal-shine-gold': metalShine === 'gold',
      'neon-fx': !!neonFx,
      [`neon-fx-${neonFx}`]: !!neonFx
    }"
    :style="cssVariables"
  >
    <router-view v-slot="{ Component }">
      <transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <UpdateDialog />
    <!-- 霓虹预设的全屏光效层：只叠加发光（screen 混合），不接收点击。 -->
    <div v-if="neonFx" class="neon-fx-layer" aria-hidden="true"></div>
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

