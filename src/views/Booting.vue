<script setup lang="ts">
// 占位路由：应用初始化（TDLib 授权态稳定）之前展示的空白页。
// 正常情况下 main.ts 在 mount 前已完成授权判定并跳转 /home 或 /login，
// 因此这里极少被看到，仅作为兜底，避免启动时闪现登录页。
</script>

<template>
    <div class="h-screen w-screen flex items-center justify-center overflow-hidden">
        <div class="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin opacity-40"></div>
    </div>
</template>
