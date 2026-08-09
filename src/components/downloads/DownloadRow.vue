<template>
    <div class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
        :class="{ 'cursor-pointer': canOpenInPlayer, 'cursor-default': !canOpenInPlayer }" @click="onRowClick"
        @contextmenu.prevent="emit('itemContextMenu', $event, item)">
        <!-- 文件图标 / 缩略图 -->
        <div class="w-11 h-11 rounded-lg overflow-hidden shrink-0 relative">
            <!-- 图片/视频缩略图 -->
            <img v-if="item.thumbnail_data_url && (item.file_type === 'photo' || item.file_type === 'video')"
                :src="item.thumbnail_data_url" class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
            <!-- 下载完成后的完整文件 -->
            <img v-else-if="item.local_path && item.file_type === 'photo'" :src="toAssetUrl(item.local_path)"
                class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
            <!-- 通用图标 -->
            <div v-else class="w-full h-full flex items-center justify-center bg-green-100 dark:bg-green-900"
                :class="iconBgClass(item)">
                <component :is="fileIcon(item)" class="w-5 h-5" :class="iconColorClass(item)" />
            </div>
            <!-- 暂停覆盖层 -->
            <div v-if="item.is_paused" class="absolute inset-0 bg-black/30 flex items-center justify-center">
                <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
            </div>
        </div>

        <div class="flex-1 min-w-0">
            <div class="flex items-center min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100">
                <!-- 文件名本身可截断显示省略号 -->
                <span class="truncate">{{ item.file_name }}</span>
                <!-- 上传中状态标签 -->
                <span v-if="isUpload && !item.is_completed"
                    class="ml-1.5 shrink-0 align-middle inline-block text-[10px] leading-4 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 rounded whitespace-nowrap">上传中</span>
                <!-- 已上传标签 -->
                <span v-else-if="isUpload && item.is_completed"
                    class="ml-1.5 shrink-0 align-middle inline-block text-[10px] leading-4 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 rounded whitespace-nowrap">已上传</span>
                <!-- 已暂停状态标签 -->
                <span v-if="item.is_paused"
                    class="ml-1.5 shrink-0 align-middle inline-block text-[10px] leading-4 text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/40 px-1.5 rounded whitespace-nowrap">已暂停</span>
                <!-- 通用资源标签（表情/头像/视频封面/贴纸等隐藏资源），始终完整显示 -->
                <span v-if="item.is_generic"
                    class="ml-1.5 shrink-0 align-middle inline-block text-[10px] leading-4 text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 rounded whitespace-nowrap">{{
                        categoryLabel }}</span>
                <!-- 自动下载图片标签 -->
                <span v-else-if="item.is_auto_photo"
                    class="ml-1.5 shrink-0 align-middle inline-block text-[10px] leading-4 text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/40 px-1.5 rounded whitespace-nowrap">自动下载</span>
                <!-- 流式传输标签（边下边播 tdstream://）：视频与音乐均适用 -->
                <span v-if="item.is_streaming"
                    class="ml-1.5 shrink-0 align-middle inline-block text-[10px] leading-4 text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/40 px-1.5 rounded whitespace-nowrap">流式传输</span>
            </div>
            <div class="flex items-center text-xs text-gray-400 min-w-0">
                <span class="truncate">{{ item.chat_title || '未知来源' }}</span>
                <span class="mx-1 shrink-0">·</span>
                <template v-if="isUpload && item.file_type === 'photo'">图片</template>
                <template v-else-if="isUpload && item.file_type === 'video'">视频</template>
                <template v-else-if="isUpload && item.file_type === 'audio'">音乐</template>
                <template v-else-if="item.is_completed">
                    <span class="shrink-0">{{ formatSize(item.total_size) }}</span>
                </template>
                <template v-else>
                    <span class="shrink-0">{{ formatSize(item.downloaded_size) }} / {{ formatSize(item.total_size)
                        }}</span>
                </template>
            </div>
            <!-- 进行中进度条（上传用绿色）。
                用 transform: scaleX 驱动宽度：只触发合成层变换，不走布局/样式重算，
                相比每次更新 :style.width + transition-all 大幅降低 setAttribute 与重绘开销。 -->
            <div v-if="!item.is_completed"
                class="mt-1.5 w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-transform duration-200 ease-linear origin-left"
                    :class="item.is_paused ? 'bg-yellow-400' : isUpload ? 'bg-emerald-500' : 'bg-blue-500'"
                    :style="{ transform: `scaleX(${Math.min(1, item.progress)})` }">
                </div>
            </div>
        </div>

        <!-- 进行中百分比 -->
        <span v-if="!item.is_completed" class="text-xs text-gray-400 shrink-0 w-10 text-right">{{ (item.progress *
            100).toFixed(0) }}%</span>

        <!-- 操作按钮 -->
        <div class="flex gap-1 shrink-0">
            <!-- 上传任务：完成前只提供「从列表移除」按钮 -->
            <template v-if="isUpload">
                <button type="button" @click.stop="emit('dismiss', item.file_id)"
                    class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg class="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </template>
            <!-- 进行中：暂停/继续 + 取消 -->
            <template v-else-if="!item.is_completed">
                <button type="button" @click.stop="emit('togglePause', item.file_id)"
                    class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    :title="item.is_paused ? '继续' : '暂停'">
                    <svg v-if="item.is_paused" class="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <svg v-else class="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                </button>
                <button type="button" @click.stop="emit('cancel', item.file_id)"
                    class="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="取消">
                    <svg class="w-4 h-4 text-gray-400 hover:text-red-500" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </template>
            <!-- 已完成：移除 -->
            <template v-else>
                <button type="button" @click.stop="emit('dismiss', item.file_id)"
                    class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg class="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
    FileIcon, ImageIcon, VideoIcon, MusicIcon, MicIcon,
} from 'lucide-vue-next';
import type { Component } from "vue";
import { hiddenCategoryLabel, type DownloadFileType, type DownloadItem } from "../../store/downloads";

const props = defineProps<{
    item: DownloadItem;
    canOpenInPlayer: boolean;
    /** 是否为上传任务（发送中的文件），用于调整进度条/按钮展示 */
    isUpload?: boolean;
}>();

const emit = defineEmits<{
    (e: "togglePause", fileId: number): void;
    (e: "cancel", fileId: number): void;
    (e: "dismiss", fileId: number): void;
    (e: "openInPlayer", item: DownloadItem): void;
    (e: "itemContextMenu", event: MouseEvent, item: DownloadItem): void;
}>();

/** 隐藏资源分类标签（emoji/视频封面/头像/动态封面/贴纸/通用） */
const categoryLabel = computed(() => hiddenCategoryLabel(props.item));

function onRowClick() {
    if (props.canOpenInPlayer) emit("openInPlayer", props.item);
}

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
