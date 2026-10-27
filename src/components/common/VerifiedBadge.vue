<template>
    <!-- Telegram 蓝色认证勾：实心圆底 + 白色勾，尺寸跟随 font-size -->
    <svg class="chat-verified-badge shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="var(--app-blue-verified, #007fea)" />
        <path d="M6.4 12.4l3.2 3.2 7.8-7.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"
            stroke-linejoin="round" />
    </svg>
</template>

<script setup lang="ts">
/**
 * 蓝色认证勾（替代 tdesign-icons-vue-next 的 VerifiedFilledIcon）。
 *
 * - 颜色走主题变量 --app-blue-verified（浅/深色各一档），不依赖 TDesign 的双色 fill/stroke 接口；
 * - 尺寸由外部 class 控制（w-4 h-4 / text-lg 都会见效：width/height 跟随 1em 兜底）。
 */
</script>

<style scoped>
.chat-verified-badge {
    width: 1em;
    height: 1em;
    display: inline-block;
    vertical-align: -0.125em;
}
</style>
