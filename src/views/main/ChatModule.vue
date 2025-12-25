<template>
    <ResizableLayout>
        <template #sidebar>
            <ChatList />
        </template>
        <template #content>
            <router-view v-slot="{ Component }">
                <component :is="Component" v-if="Component" />
                <div v-else class="h-full flex items-center justify-center text-gray-400">
                    选择一个聊天开始
                </div>
            </router-view>
        </template>
    </ResizableLayout>
</template>

<script setup lang="ts">
import ChatList from '../../components/chat/ChatList.vue';
import ResizableLayout from '../../components/layout/ResizableLayout.vue';
</script>
