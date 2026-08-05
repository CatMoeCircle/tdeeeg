<script setup lang="ts">
import TitleBar from "./components/TitleBar.vue";
import ContextMenu from "./components/contextMenu/ContextMenu.vue";
import ExternalLinkConfirm from "./components/contextMenu/ExternalLinkConfirm.vue";

// 注意：TDLib 初始化、授权态判定与首屏路由跳转已在 src/main.ts 的
// bootstrap() 中于 app.mount 之前完成。此处 App.vue 只负责渲染 UI，
// 因此启动时不会闪现登录页。
</script>

<template>
  <!-- Main app window -->
  <div class="relative flex flex-col h-screen w-screen overflow-hidden">
    <div class="absolute inset-0 bg-cover bg-center"></div>

    <div class="relative z-10 flex flex-col h-full w-full overflow-hidden">
      <TitleBar />

      <div class="flex-1 overflow-hidden relative">
        <router-view v-slot="{ Component }">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </router-view>
      </div>
    </div>

    <!-- 全局右键菜单（Teleport 到 body，最顶层） -->
    <ContextMenu />
    <!-- 打开外部链接确认弹窗（Teleport 到 body） -->
    <ExternalLinkConfirm />
  </div>
</template>

<style>
/* Global styles if needed, but Tailwind handles most */
</style>
