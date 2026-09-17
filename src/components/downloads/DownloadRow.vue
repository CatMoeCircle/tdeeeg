<template>
    <div class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
        :class="rowClass" @click="onRowClick"
        @contextmenu.prevent="emit('itemContextMenu', $event, item)">
        <div class="w-11 h-11 rounded-lg overflow-hidden shrink-0 relative">
            <img v-if="item.thumbnail_data_url && (item.file_type === 'photo' || item.file_type === 'video')"
                :src="item.thumbnail_data_url" class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
            <img v-else-if="item.local_path && item.file_type === 'photo'" :src="toAssetUrl(item.local_path)"
                class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
            <div v-else class="w-full h-full flex items-center justify-center"
                :class="iconBgClass(item)">
                <component :is="fileIcon(item)" class="w-5 h-5" :class="iconColorClass(item)" />
            </div>
            <div v-if="item.is_paused && !isStreamingIncomplete"
                class="absolute inset-0 bg-black/30 flex items-center justify-center">
                <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
            </div>
        </div>

        <div class="flex-1 min-w-0">
            <div class="flex items-center min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100">
                <span class="truncate">{{ item.file_name }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-1 mt-1">
                <span v-for="tag in displayTags" :key="tag"
                    class="shrink-0 inline-block text-[10px] leading-4 px-1.5 rounded whitespace-nowrap"
                    :class="tagClass(tag)">{{ tag }}</span>
            </div>
            <div class="flex items-center text-xs text-gray-400 min-w-0 mt-0.5">
                <span class="truncate">{{ sourceLine }}</span>
                <span class="mx-1 shrink-0">·</span>
                <template v-if="isUpload && item.file_type === 'photo'">图片</template>
                <template v-else-if="isUpload && item.file_type === 'video'">视频</template>
                <template v-else-if="isUpload && item.file_type === 'audio'">音乐</template>
                <template v-else-if="item.is_completed">
                    <span class="shrink-0">{{ formatSize(item.total_size) }}</span>
                </template>
                <template v-else>
                    <span class="shrink-0">{{ formatSize(item.downloaded_size) }} / {{ formatSize(item.total_size) }}</span>
                </template>
            </div>
            <div v-if="!item.is_completed"
                class="mt-1.5 w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-transform duration-200 ease-linear origin-left"
                    :class="progressBarClass"
                    :style="{ transform: 'scaleX(' + Math.min(1, item.progress) + ')' }">
                </div>
            </div>
        </div>

        <span v-if="!item.is_completed" class="text-xs text-gray-400 shrink-0 w-10 text-right">{{ percentText }}</span>

        <div class="flex gap-1 shrink-0">
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
            <template v-else-if="!item.is_completed">
                <button type="button" @click.stop="emit('togglePause', item.file_id)"
                    class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    :title="item.is_paused ? t('lng_continue') : t('lng_mac_menu_player_pause')">
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
                    :title="t('lng_cancel')">
                    <svg class="w-4 h-4 text-gray-400 hover:text-red-500" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </template>
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
import { useI18n } from "vue-i18n";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FileIcon, ImageIcon, VideoIcon, MusicIcon, MicIcon } from "lucide-vue-next";
import type { Component } from "vue";
import type { DownloadFileType, DownloadItem } from "../../store/downloads";
import { resolveItemTags, tagChipClass, DL_TAG, isIncompleteStreaming } from "../../utils/downloadTags";

const { t } = useI18n();

const props = defineProps<{
    item: DownloadItem;
    canOpenInPlayer: boolean;
    isUpload?: boolean;
}>();

const emit = defineEmits<{
    (e: "togglePause", fileId: number): void;
    (e: "cancel", fileId: number): void;
    (e: "dismiss", fileId: number): void;
    (e: "openInPlayer", item: DownloadItem): void;
    (e: "itemContextMenu", event: MouseEvent, item: DownloadItem): void;
}>();

const displayTags = computed(() => resolveItemTags(props.item as never));
const isStreamingIncomplete = computed(() => isIncompleteStreaming(props.item as never));

const rowClass = computed(() => ({
    "cursor-pointer": props.canOpenInPlayer,
    "cursor-default": !props.canOpenInPlayer,
}));

const progressBarClass = computed(() => {
    if (isStreamingIncomplete.value) return "bg-teal-500";
    if (props.item.is_paused) return "bg-yellow-400";
    return props.isUpload ? "bg-emerald-500" : "bg-blue-500";
});

const percentText = computed(() => {
    return ((props.item.progress || 0) * 100).toFixed(0) + "%";
});

const sourceLine = computed(() => {
    const src = props.item.source_label || props.item.chat_title;
    if (src && src.length > 0) return src;
    if (props.item.chat_id) return "对话 #" + props.item.chat_id;
    const tags = displayTags.value;
    if (tags.includes(DL_TAG.STICKER)) return "贴纸";
    if (tags.includes(DL_TAG.EMOJI)) return "emoji";
    if (tags.includes(DL_TAG.AVATAR)) return "用户头像";
    return "未知来源";
});

function tagClass(tag: string): string {
    return tagChipClass(tag);
}

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
    try {
        return convertFileSrc(localPath);
    } catch {
        return localPath;
    }
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
