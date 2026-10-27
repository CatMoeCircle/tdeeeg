<template>
    <div class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
        :class="rowClass" @click="onRowClick"
        @contextmenu.prevent.stop="emit('itemContextMenu', $event, item)">
        <div class="w-11 h-11 rounded-lg overflow-hidden shrink-0 relative">
            <img v-if="media?.kind === 'img'" :src="media.src"
                class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
            <video v-else-if="media?.kind === 'video'" :src="media.src" autoplay loop muted playsinline
                class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
            <TgsPlayer v-else-if="media?.kind === 'tgs'" :src="media.src" :loop="true" :autoplay="true"
                class="w-full h-full" />
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
            <div ref="nameRowEl" class="flex items-center min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100">
                <span ref="nameEl" class="truncate">{{ nameText }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-1 mt-1">
                <span v-for="tag in displayTags" :key="tag"
                    class="shrink-0 inline-block text-[10px] leading-4 px-1.5 rounded whitespace-nowrap"
                    :class="tagClass(tag)">{{ tagLabel(tag, t) }}</span>
            </div>
            <div class="flex items-center text-xs text-gray-400 min-w-0 mt-0.5">
                <span class="truncate">{{ sourceLine }}</span>
                <span class="mx-1 shrink-0">·</span>
                <template v-if="isUpload && item.file_type === 'photo'">{{ t('lng_local_storage_image_title') }}</template>
                <template v-else-if="isUpload && item.file_type === 'video'">{{ t('lng_media_type_videos') }}</template>
                <template v-else-if="isUpload && item.file_type === 'audio'">{{ t('lng_media_music_title') }}</template>
                <template v-else-if="item.is_completed">
                    <span class="shrink-0">{{ formatSize(item.total_size) }}</span>
                </template>
                <template v-else-if="isStreamingIncomplete">
                    <span class="shrink-0 text-teal-600 dark:text-teal-400">{{ t('download.row.streamingProgress', { current: formatSize(item.downloaded_size), total: formatSize(item.total_size) }) }}</span>
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

        <!-- 右侧动作按钮：默认宽 0（负 margin 抵消 row 的 gap-3，不占位），
             悬停条目时从右边展开，把百分比与正文顶回去；
             宽度目标 = 每个按钮 28（p-1.5 + 16 图标）+ 按钮间 gap 4 -->
        <div :class="[
            'shrink-0 w-0 -ml-3 overflow-hidden flex gap-1 opacity-0 transition-all duration-200 group-hover:ml-0 group-hover:opacity-100',
            hasTwoActionButtons ? 'group-hover:w-[60px]' : 'group-hover:w-7',
        ]">
            <template v-if="isUpload">
                <button type="button" @click.stop="emit('dismiss', item.file_id)"
                    class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
                    <svg class="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </template>
            <template v-else-if="!item.is_completed">
                <button type="button" @click.stop="emit('togglePause', item.file_id)"
                    class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
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
                    class="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
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
                    class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
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
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { FileIcon, ImageIcon, VideoIcon, MusicIcon, MicIcon } from "lucide-vue-next";
import type { Component } from "vue";
import type { DownloadFileType, DownloadItem } from "../../store/downloads";
import { resolveItemTags, tagChipClass, tagLabel, DL_TAG, isIncompleteStreaming } from "../../utils/downloadTags";
import { useItemMedia } from "../../utils/downloadThumb";
import TgsPlayer from "../common/TgsPlayer.vue";

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
const media = useItemMedia(() => props.item);

/** 悬停时展开的动作按钮数量：下载中为「暂停 + 取消」两个，上传/已完成只有一个 */
const hasTwoActionButtons = computed(() => !props.isUpload && !props.item.is_completed);

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
    if (src && src.length > 0) return tagLabel(src, t);
    if (props.item.chat_id) return t("download.row.chatFallback", { id: props.item.chat_id });
    const tags = displayTags.value;
    if (tags.includes(DL_TAG.STICKER)) return t("download.row.sticker");
    if (tags.includes(DL_TAG.EMOJI)) return t("download.row.emoji");
    if (tags.includes(DL_TAG.AVATAR)) return t("download.row.avatar");
    return t("download.row.unknownSource");
});

function tagClass(tag: string): string {
    return tagChipClass(tag);
}

function onRowClick() {
    if (props.canOpenInPlayer) emit("openInPlayer", props.item);
}

/**
 * 文件名中间省略（`xxxx..xxx.png`），按名称行的实际可显示宽度计算：
 * 扩展名始终保留；正文按约 60% 前段 / 40% 后段估算字符数，再用 canvas
 * 测宽逐步回退，保证结果能放进当前宽度。容器宽度变化（含悬停展开按钮、
 * 面板 resize）由 ResizeObserver 触发重算。
 */
const nameRowEl = ref<HTMLElement | null>(null);
const nameEl = ref<HTMLElement | null>(null);
const nameText = ref(props.item.file_name);

let nameResizeObs: ResizeObserver | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

function measureTextWidth(text: string): number {
    if (!text) return 0;
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    const el = nameEl.value;
    if (!measureCtx || !el) return text.length * 7;
    const cs = getComputedStyle(el);
    measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return measureCtx.measureText(text).width;
}

function updateNameEllipsis() {
    const row = nameRowEl.value;
    if (!row) return;
    const name = props.item.file_name;
    const avail = row.clientWidth;
    if (!avail || measureTextWidth(name) <= avail) {
        nameText.value = name;
        return;
    }

    const dot = name.lastIndexOf(".");
    const hasExt = dot > 0 && name.length - dot <= 8;
    const ext = hasExt ? name.slice(dot) : "";
    const body = hasExt ? name.slice(0, dot) : name;
    const budget = avail - measureTextWidth("..") - measureTextWidth(ext);
    if (budget <= 0) {
        // 宽度连「.. + 扩展名」都放不下：仍优先保留扩展名，剩余交给 CSS truncate 兜底
        nameText.value = ext || name;
        return;
    }

    const avg = measureTextWidth(body) / Math.max(1, body.length);
    const chars = Math.min(body.length, Math.max(2, Math.floor(budget / Math.max(0.01, avg))));
    let head = Math.max(1, Math.round(chars * 0.6));
    let tail = Math.max(1, chars - head);
    const build = () => body.slice(0, head) + ".." + (tail > 0 ? body.slice(-tail) : "") + ext;

    let text = build();
    let guard = 0;
    while (measureTextWidth(text) > avail && (head > 1 || tail > 1) && guard++ < 400) {
        if (head >= tail && head > 1) head--;
        else if (tail > 1) tail--;
        else break;
        text = build();
    }
    nameText.value = text;
}

watch(() => props.item.file_name, () => {
    updateNameEllipsis();
});

onMounted(() => {
    updateNameEllipsis();
    if (typeof ResizeObserver !== "undefined" && nameRowEl.value) {
        nameResizeObs = new ResizeObserver(() => updateNameEllipsis());
        nameResizeObs.observe(nameRowEl.value);
    }
});

onBeforeUnmount(() => {
    nameResizeObs?.disconnect();
    nameResizeObs = null;
});

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
