<template>
    <ResizableLayout>
        <template #sidebar>
            <ChatList />
        </template>

        <template #content>
            <div class="relative w-full h-full">
                <!-- 背景层 -->
                <div v-if="false" class="absolute inset-0 bg-[url('../../assets/1.jpg')] bg-cover bg-center"></div>

                <!-- 前景内容 -->
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
