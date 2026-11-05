<template>
    <!-- Telegram 蓝色认证标：印章轮廓（Verified.svg）+ 白色对勾，尺寸跟随 font-size -->
    <svg class="chat-verified-badge shrink-0" viewBox="0 0 20 20" aria-hidden="true">
        <!-- 印章外轮廓（实心，色值走主题变量） -->
        <path
            d="M17.625 8.625 16.25 7.375V5.625C16.25 4.625 15.375 3.75 14.375 3.75H12.625L11.375 2.375C10.625 1.625 9.5 1.625 8.75 2.375L7.375 3.75H5.625C4.625 3.75 3.75 4.625 3.75 5.625V7.375L2.375 8.625C1.625 9.375 1.625 10.5 2.375 11.25L3.75 12.625V14.375C3.75 15.375 4.625 16.25 5.625 16.25H7.375L8.75 17.625C9.5 18.375 10.625 18.375 11.375 17.625L12.75 16.25H14.5C15.5 16.25 16.375 15.375 16.375 14.375V12.625L17.75 11.25C18.25 10.625 18.25 9.375 17.625 8.625Z"
            fill="var(--app-blue-verified, #007fea)" />
        <!-- 白色对勾（图层叠在印章之上，避免背景透出把勾吃掉） -->
        <path
            d="M13.625 8.625 9.25 13C9 13.25 8.625 13.25 8.375 13L6.375 11.125C6.25 10.875 6.25 10.375 6.375 10.125C6.625 10 7.125 10 7.375 10.125L8.75 11.625L12.625 7.75C12.875 7.5 13.25 7.5 13.5 7.75C13.75 7.875 13.75 8.375 13.625 8.625H13.625Z"
            fill="#fff" />
    </svg>
</template>

<script setup lang="ts">
/**
 * 蓝色认证标（替代 tdesign-icons-vue-next 的 VerifiedFilledIcon / 旧圆形蓝 V）。
 *
 * - 几何取自 src/assets/Verified.svg（印章外轮廓 + 对勾描边），内联以保证对勾能独立填白；
 * - 印章颜色走主题变量 --app-blue-verified（浅/深色各一档），不依赖 TDesign 的双色 fill/stroke 接口；
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
