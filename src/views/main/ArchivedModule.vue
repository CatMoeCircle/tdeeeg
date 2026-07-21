<template>
    <ResizableLayout>
        <template #sidebar>
            <div class="h-full flex flex-col bg-white dark:bg-gray-900">
                <ChatList :is-archive="true" class="flex-1" />
            </div>
        </template>
        <template #content>
            <div class="relative w-full h-full">
                <div v-if="!hasChildRoute" class="absolute inset-0 flex items-center justify-center text-gray-400">
                    选择一个归档聊天
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
import ResizableLayout from '../../components/layout/ResizableLayout.vue';
import ChatList from '../../components/chat/ChatList.vue';

const route = useRoute();
const hasChildRoute = computed(() => !!route.params.id);
</script>
