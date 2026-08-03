<template>
    <div class="flex flex-col h-full bg-white dark:bg-gray-900">
        <!-- 标题栏 -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div>
                <h2 class="text-lg font-semibold">下载管理器</h2>
                <p class="text-xs text-gray-500 mt-1">
                    <template v-if="store.activeCount > 0">
                        {{ store.activeCount }} 个文件正在下载
                    </template>
                    <template v-else-if="store.hasHiddenActive">
                        {{ store.pendingItems.length }} 个隐藏下载进行中
                    </template>
                    <template v-else>
                        暂无活跃下载
                    </template>
                </p>
            </div>
            <!-- 三点菜单 -->
            <div class="relative" :ref="setMenuRef">
                <button type="button" @click="menuOpen = !menuOpen"
                    class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    <svg class="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                    </svg>
                </button>
                <!-- 下拉菜单 -->
                <Transition name="fade">
                    <div v-if="menuOpen"
                        class="absolute right-0 top-10 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                        <button type="button" @click="store.toggleShowHidden(); menuOpen = false"
                            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path v-if="!store.showHidden"
                                    d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                                <line v-if="!store.showHidden" x1="1" y1="1" x2="23" y2="23" />
                                <path v-if="store.showHidden" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle v-if="store.showHidden" cx="12" cy="12" r="3" />
                            </svg>
                            {{ store.showHidden ? '隐藏通用资源' : '显示隐藏的通用资源' }}
                            <span v-if="store.hasHiddenActive && !store.showHidden"
                                class="ml-auto text-xs text-gray-400">({{
                                    store.pendingItems.filter(i => i.is_generic).length}})</span>
                        </button>
                        <hr class="my-1 border-gray-200 dark:border-gray-700" />
                        <button type="button" @click="store.clearCompleted(); menuOpen = false"
                            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                            清除已完成
                        </button>
                    </div>
                </Transition>
            </div>
        </div>

        <!-- 隐藏资源提示条 -->
        <div v-if="store.hasHiddenActive && !store.showHidden"
            class="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800/30 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
            <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <span>有 {{store.pendingItems.filter(i => i.is_generic).length}} 个通用资源下载已隐藏</span>
            <button type="button" @click="store.showHidden = true"
                class="ml-auto font-medium hover:underline shrink-0">查看</button>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
            <!-- 进行中/暂停 -->
            <div v-if="store.pendingItems.length > 0" class="py-2">
                <div class="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    进行中
                </div>
                <div v-for="item in store.pendingItems" :key="item.file_id"
                    class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group">
                    <!-- 文件图标 / 缩略图 -->
                    <div class="w-11 h-11 rounded-lg overflow-hidden shrink-0 relative">
                        <!-- 图片/视频缩略图 -->
                        <img v-if="item.thumbnail_data_url && (item.file_type === 'photo' || item.file_type === 'video')"
                            :src="item.thumbnail_data_url"
                            class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
                        <!-- 下载完成后的完整文件 -->
                        <img v-else-if="item.local_path && item.file_type === 'photo'"
                            :src="toAssetUrl(item.local_path)"
                            class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
                        <!-- 通用图标 -->
                        <div v-else class="w-full h-full flex items-center justify-center" :class="iconBgClass(item)">
                            <component :is="fileIcon(item)" class="w-5 h-5" :class="iconColorClass(item)" />
                        </div>
                        <!-- 暂停覆盖层 -->
                        <div v-if="item.is_paused"
                            class="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                        </div>
                    </div>

                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                            {{ item.file_name }}
                            <span v-if="item.is_generic"
                                class="ml-1.5 text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1 rounded">通用</span>
                        </p>
                        <p class="text-xs text-gray-400 truncate">
                            {{ item.chat_title || '未知来源' }}
                            <span class="mx-1">·</span>
                            {{ formatSize(item.downloaded_size) }} / {{ formatSize(item.total_size) }}
                        </p>
                        <div class="mt-1.5 w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all duration-300"
                                :class="item.is_paused ? 'bg-yellow-400' : 'bg-blue-500'"
                                :style="{ width: Math.min(100, item.progress * 100) + '%' }">
                            </div>
                        </div>
                    </div>

                    <span class="text-xs text-gray-400 shrink-0 w-10 text-right">{{ (item.progress * 100).toFixed(0)
                        }}%</span>

                    <!-- 操作按钮 -->
                    <div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <!-- 暂停/继续 -->
                        <button type="button" @click="store.togglePause(item.file_id)"
                            class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                            :title="item.is_paused ? '继续' : '暂停'">
                            <svg v-if="item.is_paused" class="w-4 h-4 text-gray-500" viewBox="0 0 24 24"
                                fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            <svg v-else class="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                        </button>
                        <!-- 取消 -->
                        <button type="button" @click="store.cancelDownload(item.file_id)"
                            class="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg" title="取消">
                            <svg class="w-4 h-4 text-gray-400 hover:text-red-500" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 已完成 -->
            <div v-if="store.completedItems.length > 0" class="py-2">
                <div class="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    已完成
                </div>
                <div v-for="item in store.completedItems" :key="item.file_id"
                    class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group">
                    <!-- 完整展示 -->
                    <div class="w-11 h-11 rounded-lg overflow-hidden shrink-0">
                        <img v-if="item.local_path && (item.file_type === 'photo' || item.file_type === 'video')"
                            :src="toAssetUrl(item.local_path)"
                            class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
                        <img v-else-if="item.thumbnail_data_url" :src="item.thumbnail_data_url"
                            class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
                        <div v-else
                            class="w-full h-full flex items-center justify-center bg-green-100 dark:bg-green-900">
                            <svg class="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                            {{ item.file_name }}
                            <span v-if="item.is_generic"
                                class="ml-1.5 text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1 rounded">通用</span>
                        </p>
                        <p class="text-xs text-gray-400 truncate">
                            {{ item.chat_title || '未知来源' }}
                            <span class="mx-1">·</span>
                            {{ formatSize(item.total_size) }}
                        </p>
                    </div>
                    <button type="button" @click="store.dismissItem(item.file_id)"
                        class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg class="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>

            <!-- 空状态 -->
            <div v-if="store.visibleItems.length === 0"
                class="flex flex-col items-center justify-center h-full text-gray-400">
                <svg class="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <p class="text-sm">暂无下载任务</p>
                <p v-if="store.hasHiddenActive" class="text-xs mt-2 text-blue-500">
                    <button type="button" @click="store.toggleShowHidden()" class="hover:underline">
                        {{store.pendingItems.filter(i => i.is_generic).length}} 个通用资源被隐藏，点击查看
                    </button>
                </p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useDownloadStore, type DownloadFileType } from "../../store/downloads";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
    FileIcon, ImageIcon, VideoIcon, MusicIcon, MicIcon,
} from 'lucide-vue-next';
import type { Component } from "vue";

const store = useDownloadStore();
const menuOpen = ref(false);
const menuEl = ref<HTMLElement | null>(null);

function setMenuRef(el: any) {
    menuEl.value = el as HTMLElement;
}

// 点击外部关闭菜单
function onClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (menuOpen.value && menuEl.value && !menuEl.value.contains(target)) {
        menuOpen.value = false;
    }
}

onMounted(() => document.addEventListener('click', onClickOutside));
onUnmounted(() => document.removeEventListener('click', onClickOutside));

function formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const k = 1024;
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
    const value = bytes / Math.pow(k, i);
    return value.toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

function iconBgClass(item: { file_type: DownloadFileType }): string {
    switch (item.file_type) {
        case "photo": return "bg-purple-100 dark:bg-purple-900";
        case "video": return "bg-pink-100 dark:bg-pink-900";
        case "audio": return "bg-orange-100 dark:bg-orange-900";
        case "voice": return "bg-teal-100 dark:bg-teal-900";
        case "animation": return "bg-indigo-100 dark:bg-indigo-900";
        case "sticker": return "bg-yellow-100 dark:bg-yellow-900";
        case "avatar": return "bg-cyan-100 dark:bg-cyan-900";
        default: return "bg-blue-100 dark:bg-blue-900";
    }
}

function iconColorClass(item: { file_type: DownloadFileType }): string {
    switch (item.file_type) {
        case "photo": return "text-purple-500";
        case "video": return "text-pink-500";
        case "audio": return "text-orange-500";
        case "voice": return "text-teal-500";
        case "animation": return "text-indigo-500";
        case "sticker": return "text-yellow-500";
        case "avatar": return "text-cyan-500";
        default: return "text-blue-500";
    }
}

function toAssetUrl(localPath: string): string {
    try { return convertFileSrc(localPath); } catch { return localPath; }
}

function fileIcon(item: { file_type: DownloadFileType }): Component {
    switch (item.file_type) {
        case "photo": return ImageIcon;
        case "video": return VideoIcon;
        case "audio": return MusicIcon;
        case "voice": return MicIcon;
        default: return FileIcon;
    }
}
</script>
