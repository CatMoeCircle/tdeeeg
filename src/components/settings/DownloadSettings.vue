<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800">
            <h2 class="text-lg font-semibold">数据和存储</h2>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div class="max-w-2xl">

                <!-- ===== 自动下载区域 ===== -->
                <div class="space-y-6">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">自动下载
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <!-- 自动下载总开关 -->
                    <div class="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div>
                            <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">启用自动下载</h4>
                            <p class="text-xs text-gray-400 mt-0.5">关闭后将不会自动下载任何媒体文件</p>
                        </div>
                        <ToggleSwitch :modelValue="settings.autoDownload.enabled"
                            @update:modelValue="settings.autoDownload.enabled = $event" />
                    </div>

                    <template v-if="settings.autoDownload.enabled">

                        <!-- ===== 图片（折叠） ===== -->
                        <CollapsibleSection :open="openSections.photos" title="图片" description="视频封面、图片、贴纸、音频封面等"
                            @toggle="openSections.photos = !openSections.photos">
                            <ChatTypeToggle v-for="cat in categories" :key="'photo-' + cat.key" :label="cat.label"
                                :modelValue="settings.autoDownload.photos[cat.key]"
                                @update:modelValue="settings.autoDownload.photos[cat.key] = $event" />
                        </CollapsibleSection>

                        <!-- ===== 视频（折叠） ===== -->
                        <CollapsibleSection :open="openSections.videos" title="视频" description="自动下载小于指定体积的视频"
                            @toggle="openSections.videos = !openSections.videos">
                            <ChatTypeToggle v-for="cat in categories" :key="'video-' + cat.key" :label="cat.label"
                                :modelValue="settings.autoDownload.videos[cat.key]"
                                @update:modelValue="settings.autoDownload.videos[cat.key] = $event" />
                            <div class="flex items-center justify-between py-2 mt-1">
                                <span class="text-sm text-gray-600 dark:text-gray-400">最大体积</span>
                                <div class="flex items-center gap-2">
                                    <input type="range" min="1" max="500" step="1"
                                        v-model.number="settings.autoDownload.videos.maxSize"
                                        class="w-24 h-1 accent-blue-500" />
                                    <span class="text-sm font-medium tabular-nums min-w-16 text-right">{{
                                        settings.autoDownload.videos.maxSize }} MB</span>
                                </div>
                            </div>
                        </CollapsibleSection>

                        <!-- ===== 文件（折叠） ===== -->
                        <CollapsibleSection :open="openSections.files" title="文件" description="自动下载小于指定体积的文档文件"
                            @toggle="openSections.files = !openSections.files">
                            <ChatTypeToggle v-for="cat in categories" :key="'file-' + cat.key" :label="cat.label"
                                :modelValue="settings.autoDownload.files[cat.key]"
                                @update:modelValue="settings.autoDownload.files[cat.key] = $event" />
                            <div class="flex items-center justify-between py-2 mt-1">
                                <span class="text-sm text-gray-600 dark:text-gray-400">最大体积</span>
                                <div class="flex items-center gap-2">
                                    <input type="range" min="1" max="500" step="1"
                                        v-model.number="settings.autoDownload.files.maxSize"
                                        class="w-24 h-1 accent-blue-500" />
                                    <span class="text-sm font-medium tabular-nums min-w-16 text-right">{{
                                        settings.autoDownload.files.maxSize }} MB</span>
                                </div>
                            </div>
                        </CollapsibleSection>

                    </template>

                    <div v-else class="pb-4 text-xs text-gray-400 text-center">
                        自动下载已关闭，需要手动点击下载按钮来获取媒体文件。
                    </div>
                </div>

                <!-- ===== 后续其他区域占位 ===== -->
                <div class="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">存储管理
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 py-4 text-center">即将推出</p>
                </div>

            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { settings } from '../../store/settings';
import type { AutoDownloadByType } from '../../store/settings';
import ToggleSwitch from './ToggleSwitch.vue';
import CollapsibleSection from './CollapsibleSection.vue';
import ChatTypeToggle from './ChatTypeToggle.vue';


const categories: { key: keyof AutoDownloadByType; label: string }[] = [
    { key: 'contacts', label: '联系人' },
    { key: 'privateChats', label: '私聊' },
    { key: 'channels', label: '频道' },
    { key: 'groups', label: '群组' },
];

const openSections = reactive({
    photos: false,
    videos: false,
    files: false,
});
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: 2px;
}

.custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
}
</style>
