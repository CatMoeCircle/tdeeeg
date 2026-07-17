<template>
    <ResizableLayout>
        <template #sidebar>
            <div class="h-full flex flex-col bg-white dark:bg-gray-900">
                <ChatList :is-archive="true" class="flex-1" />
            </div>
        </template>
        <template #content>
            <router-view v-slot="{ Component }">
                <component :is="Component" v-if="Component" />
                <div v-else class="h-full flex items-center justify-center text-gray-400">
                    选择一个归档聊天
                </div>
            </router-view>
        </template>
    </ResizableLayout>
</template>

<script setup lang="ts">
import ResizableLayout from '../../components/layout/ResizableLayout.vue';
import ChatList from '../../components/chat/ChatList.vue';
</script>
