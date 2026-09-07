<script setup lang="ts">
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";

const router = useRouter();
const route = useRoute();

const active = ref(0);

const tabs = [
  { name: "home", path: "/", icon: "todo-list-o", label: "课程表" },
  { name: "courses", path: "/courses", icon: "edit", label: "课程" },
  { name: "import", path: "/import", icon: "upgrade", label: "导入" },
  { name: "settings", path: "/settings", icon: "setting-o", label: "设置" },
];

function onChange(index: number) {
  router.push(tabs[index].path);
}
</script>

<template>
  <van-tabbar
    v-model="active"
    fixed
    placeholder
    safe-area-inset-bottom
    @change="onChange"
  >
    <van-tabbar-item
      v-for="tab in tabs"
      :key="tab.name"
      :icon="tab.icon"
    >
      {{ tab.label }}
    </van-tabbar-item>
  </van-tabbar>
</template>
