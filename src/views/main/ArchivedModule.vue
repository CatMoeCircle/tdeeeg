<template>
    <ResizableLayout>
        <template #sidebar>
            <div class="h-full flex flex-col bg-white dark:bg-gray-900">
                <div class="p-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 class="text-lg font-semibold">归档对话</h2>
                </div>
                <div class="p-4 text-gray-500">暂无归档</div>
            </div>
        </template>
        <template #content>
            <div class="h-full flex items-center justify-center text-gray-400">
                选择一个归档聊天
            </div>
        </template>
    </ResizableLayout>
</template>

<script setup lang="ts">
import ResizableLayout from '../../components/layout/ResizableLayout.vue';
</script>
