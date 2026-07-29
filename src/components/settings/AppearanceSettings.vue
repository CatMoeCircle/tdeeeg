<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800">
            <h2 class="text-lg font-semibold">外观设置</h2>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div class="max-w-2xl">
                <div class="mb-8">
                    <h3 class="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wider">分组文件夹样式</h3>

                    <div class="grid grid-cols-3 gap-4">
                        <button @click="settings.folderStyle = 'tabs'"
                            class="p-4 border rounded-lg transition-all flex flex-col items-center gap-3 hover:shadow-md"
                            :class="settings.folderStyle === 'tabs' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 ring-2 ring-blue-500 ring-opacity-50' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                            <div class="w-full h-2 bg-gray-300 rounded-full"></div>
                            <span class="font-medium">标签</span>
                        </button>

                        <button @click="settings.folderStyle = 'pills'"
                            class="p-4 border rounded-lg transition-all flex flex-col items-center gap-3 hover:shadow-md"
                            :class="settings.folderStyle === 'pills' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 ring-2 ring-blue-500 ring-opacity-50' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                            <div class="w-full h-6 bg-gray-300 rounded-full"></div>
                            <span class="font-medium">胶囊</span>
                        </button>

                        <button @click="settings.folderStyle = 'text'"
                            class="p-4 border rounded-lg transition-all flex flex-col items-center gap-3 hover:shadow-md"
                            :class="settings.folderStyle === 'text' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 ring-2 ring-blue-500 ring-opacity-50' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                            <div class="text-lg font-bold text-gray-400">Aa</div>
                            <span class="font-medium">文本</span>
                        </button>
                    </div>
                    <p class="mt-2 text-sm text-gray-500">选择在聊天列表顶部显示的分组样式。</p>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { settings } from '../../store/settings';
</script>
