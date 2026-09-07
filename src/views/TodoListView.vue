<script setup lang="ts">
import { useRouter } from "vue-router";
import { ArrowLeft } from "@lucide/vue";
import TodoPanel from "@/components/todo/TodoPanel.vue";

const router = useRouter();

const goBack = () => {
  router.push("/");
};
</script>

<template>
  <div class="todo-page">
    <header class="todo-page-header">
      <button class="back-button" type="button" aria-label="返回课程表" @click="goBack">
        <ArrowLeft :size="20" />
      </button>
      <h1 class="page-title">待办列表</h1>
      <div class="header-spacer" />
    </header>

    <main class="todo-page-content">
      <TodoPanel />
    </main>
  </div>
</template>

<style scoped>
.todo-page {
  min-height: 100vh;
  background: var(--theme-bg-color);
  color: var(--theme-body-text);
}

.todo-page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  padding-top: calc(16px + env(safe-area-inset-top, 0px));
  background: var(--theme-header-bg);
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 45%, transparent);
}

.back-button {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-header-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.back-button:active {
  background: color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.page-title {
  margin: 0;
  color: var(--theme-header-text);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.header-spacer {
  width: 34px;
  flex: 0 0 34px;
}

.todo-page-content {
  padding: 16px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
}
</style>
