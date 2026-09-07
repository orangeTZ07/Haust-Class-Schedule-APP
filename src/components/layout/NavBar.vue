<script setup lang="ts">
</script>

<template>
  <van-nav-bar fixed placeholder>
    <template #left>
      <slot name="left" />
    </template>
    <template #title>
      <slot />
    </template>
    <template #right>
      <slot name="right" />
    </template>
  </van-nav-bar>
</template>
