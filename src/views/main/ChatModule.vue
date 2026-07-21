<template>
    <ResizableLayout>
        <template #sidebar>
            <ChatList />
        </template>

        <template #content>
            <div class="relative w-full h-full">
                <div v-if="!hasChildRoute" class="absolute inset-0 z-10 flex items-center justify-center text-gray-400">
                    选择一个聊天开始
                </div>
                <router-view v-slot="{ Component }">
                    <KeepAlive>
                        <component :is="Component" class="relative z-10 h-full" />
                    </KeepAlive>
                </router-view>
            </div>
        </template>
    </ResizableLayout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ChatList from '../../components/chat/ChatList.vue';
import ResizableLayout from '../../components/layout/ResizableLayout.vue';

const route = useRoute();
const hasChildRoute = computed(() => !!route.params.id);
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
