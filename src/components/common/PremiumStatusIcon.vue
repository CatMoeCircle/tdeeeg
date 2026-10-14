<template>
  <!-- Premium 默认状态图标（状态选择器同款：品牌色星形字形） -->
  <span class="tgico tgico-emoji-status premium-status-icon" />
</template>

<style scoped>
.tgico-emoji-status::before {
  content: "\ea2a";
  color: var(--app-brand, #2aabee);
}
</style>
