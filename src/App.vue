<script setup lang="ts">
import { useTheme } from "./composables/useTheme";

const { themeConfig, cssVariables } = useTheme();
</script>

<template>
  <div id="app" :class="{ dark: themeConfig.mode === 'dark' }" :style="cssVariables">
    <router-view v-slot="{ Component }">
      <transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
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
