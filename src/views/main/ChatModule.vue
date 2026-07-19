<template>
    <ResizableLayout>
        <template #sidebar>
            <ChatList />
        </template>

        <template #content>
            <div class="relative w-full h-full">
                <router-view v-slot="{ Component }">
                    <component :is="Component" v-if="Component" class="relative z-10 h-full" />
                    <div v-else class="relative z-10 h-full flex items-center justify-center text-gray-400">
                        选择一个聊天开始
                    </div>
                </router-view>
            </div>
        </template>
    </ResizableLayout>
</template>

<script setup lang="ts">
import ChatList from '../../components/chat/ChatList.vue';
import ResizableLayout from '../../components/layout/ResizableLayout.vue';
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: scale(0.8);
}
</style>
