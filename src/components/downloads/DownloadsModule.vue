<template>
    <!-- 下载管理器：左下角悬浮窗 -->
    <Teleport to="body">
        <Transition name="dl-panel">
            <div v-if="store.isPanelOpen" ref="panelEl"
                class="fixed bottom-4 left-20 z-50 flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
                :style="panelStyle" :class="{ 'resizing': isResizing }">
                <!-- 标题栏 -->
                <div
                    class="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
                    <div class="min-w-0">
                        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">下载管理器</h2>
                        <p class="text-xs text-gray-500 mt-0.5">
                            <template v-if="uploadStore.hasActiveUploads">
                                {{ uploadStore.activeCount }} 个文件正在上传
                            </template>
                            <template v-else-if="store.downloadingItems.length > 0">
                                {{ store.downloadingItems.length }} 个文件正在下载<template
                                    v-if="store.streamingItems.length > 0">，{{ store.streamingItems.length
                                    }} 个流式传输中</template>
                            </template>
                            <template v-else-if="store.streamingItems.length > 0">
                                {{ store.streamingItems.length }} 个流式传输中
                            </template>
                            <template v-else-if="store.pausedItems.length > 0">
                                {{ store.pausedItems.length }} 个文件已暂停
                            </template>
                            <template v-else-if="store.hasHiddenActive">
                                {{ hiddenActiveCount }} 个隐藏下载进行中
                            </template>
                            <template v-else>
                                暂无活跃下载
                            </template>
                        </p>
                    </div>
                    <div class="relative flex items-center gap-1 pr-1" :ref="setMenuRef">
                        <button type="button" @click="menuOpen = !menuOpen"
                            class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            <svg class="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="12" cy="19" r="2" />
                            </svg>
                        </button>
                        <Transition name="fade">
                            <div v-if="menuOpen"
                                class="absolute right-0 top-10 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                                <button type="button" @click="store.resetFilters(); menuOpen = false"
                                    class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="2">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M12 6v14" />
                                        <path d="M7 11l5 5 5-5" />
                                    </svg>
                                    重置标签过滤器
                                </button>
                                <hr class="my-1 border-gray-200 dark:border-gray-700" />
                                <button type="button" @click="store.clearCompleted(); menuOpen = false"
                                    class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="2">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path
                                            d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 112 2v2" />
                                    </svg>
                                    清除已完成
                                </button>
                                <button v-if="store.pendingItems.length > 0" type="button"
                                    @click="menuOpen = false; confirmCancelAll()"
                                    class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                    </svg>
                                    取消全部下载
                                </button>
                            </div>
                        </Transition>
                        <button type="button" @click="store.closePanel()"
                            class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            <svg class="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- 标签过滤器：禁用选中；滚轮/触控板横向滚动（无滚动条） -->
                <div class="px-3 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0 overflow-x-auto scrollbar-none select-none"
                    v-smooth-wheel="'horizontal'">
                    <div class="flex items-center gap-1.5 w-max">
                        <button v-for="opt in FILTER_OPTIONS" :key="opt.key" type="button"
                            class="shrink-0 select-none text-[11px] leading-5 px-2 rounded-full border transition-colors"
                            :class="store.filterKeys.has(opt.key)
                                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'"
                            @click="store.setFilterKey(opt.key, !store.filterKeys.has(opt.key))">
                            {{ opt.label }}
                        </button>
                    </div>
                </div>

                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar" v-smooth-wheel>
                    <!-- 正在上传 -->
                    <div v-if="uploadStore.activeItems.length > 0" class="py-2">
                        <div class="px-4 py-1.5 text-xs font-medium text-emerald-500 dark:text-emerald-400 flex items-center gap-1.5">
                            <UploadCloudIcon class="w-3.5 h-3.5" />
                            正在上传
                        </div>
                        <DownloadRow v-for="item in uploadStore.activeItems" :key="item.remote_id || item.file_id"
                            :item="item" :can-open-in-player="false" is-upload
                            @dismiss="uploadStore.dismiss(item.file_id)"
                            @item-context-menu="onUploadContextMenu" />
                    </div>
                    <div v-if="uploadStore.completedItems.length > 0" class="py-2">
                        <div class="px-4 py-1.5 text-xs font-medium text-emerald-500 dark:text-emerald-400 flex items-center gap-1.5">
                            <UploadCloudIcon class="w-3.5 h-3.5" />
                            已上传
                        </div>
                        <DownloadRow v-for="item in uploadStore.completedItems" :key="item.remote_id || item.file_id"
                            :item="item" :can-open-in-player="false" is-upload
                            @dismiss="uploadStore.dismiss(item.file_id)"
                            @item-context-menu="onUploadContextMenu" />
                    </div>

                    <!-- 正在下载 -->
                    <div v-if="store.downloadingItems.length > 0" class="py-2">
                        <div class="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                            正在下载
                        </div>
                        <DownloadRow v-for="item in store.downloadingItems" :key="item.remote_id || item.file_id"
                            :item="item" :can-open-in-player="false" @toggle-pause="store.togglePause"
                            @cancel="store.cancelDownload" @item-context-menu="onItemContextMenu" />
                    </div>

                    <!-- 流式传输（未完成，可折叠；不进已暂停） -->
                    <div v-if="store.streamingItems.length > 0" class="py-2">
                        <button type="button"
                            class="w-full px-4 py-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 flex items-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
                            @click="streamingCollapsed = !streamingCollapsed">
                            <svg class="w-3.5 h-3.5 transition-transform"
                                :class="streamingCollapsed ? '-rotate-90' : ''" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                            流式传输
                            <span
                                class="normal-case text-[10px] text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/40 px-1.5 rounded">
                                {{ store.streamingItems.length }}
                            </span>
                            <span class="ml-auto text-[10px] text-gray-400 font-normal normal-case">
                                未下载完成
                            </span>
                        </button>
                        <template v-if="!streamingCollapsed">
                            <DownloadRow v-for="item in store.streamingItems" :key="item.remote_id || item.file_id"
                                :item="item" :can-open-in-player="false" @toggle-pause="store.togglePause"
                                @cancel="store.cancelDownload" @item-context-menu="onItemContextMenu" />
                        </template>
                    </div>

                    <!-- 已暂停 -->
                    <div v-if="store.pausedItems.length > 0" class="py-2">
                        <div class="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            已暂停
                            <span class="normal-case text-[10px] text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/40 px-1.5 rounded">
                                {{ store.pausedItems.length }}
                            </span>
                        </div>
                        <DownloadRow v-for="item in store.pausedItems" :key="item.remote_id || item.file_id"
                            :item="item" :can-open-in-player="false" @toggle-pause="store.togglePause"
                            @cancel="store.cancelDownload" @item-context-menu="onItemContextMenu" />
                    </div>

                    <!-- 已完成 -->
                    <div v-if="store.completedItems.length > 0" class="py-2">
                        <div class="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                            已完成
                            <span class="ml-1 text-[10px] font-normal text-gray-400">{{ store.completedItems.length }}</span>
                        </div>
                        <DownloadRow v-for="item in displayCompletedItems" :key="item.remote_id || item.file_id"
                            :item="item" :can-open-in-player="canOpenInPlayer(item)" @dismiss="store.dismissItem"
                            @open-in-player="onCompletedClick" @item-context-menu="onItemContextMenu" />
                        <button v-if="completedHasMore" type="button" @click="loadMoreCompleted"
                            class="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                            显示更多（剩余 {{ store.completedItems.length - displayCompletedItems.length }} 项）
                        </button>
                    </div>

                    <!-- 空状态 -->
                    <div v-if="store.visibleItems.length === 0 && uploadStore.items && Object.keys(uploadStore.items).length === 0"
                        class="flex flex-col items-center justify-center h-full text-gray-400">
                        <svg class="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="1.5">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <p class="text-sm">暂无下载任务</p>
                        <p v-if="store.hasHiddenActive" class="text-xs mt-2 text-blue-500">
                            <button type="button" @click="revealGenericViaFilter()" class="hover:underline">
                                {{ hiddenActiveCount }} 个隐藏下载被过滤，点击查看
                            </button>
                        </p>
                    </div>
                </div>

                <div class="absolute top-1 right-1 w-5 h-5 cursor-nesw-resize group z-50 select-none"
                    @mousedown.prevent="startCornerResize">
                    <svg class="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-blue-500 transition-colors"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 3v6M21 3h-6M21 3l-6 6" />
                    </svg>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useDownloadStore, type DownloadItem, FILTER_OPTIONS } from "../../store/downloads";
import { FILTER_KEY } from "../../utils/downloadTags";
import { useUploadStore } from "../../store/upload";
import DownloadRow from "./DownloadRow.vue";
import { openContextMenu } from "../../store/contextMenu";
import type { ContextMenuItem } from "../../components/contextMenu/types";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import {
    MessageCircleIcon, FolderOpenIcon, TrashIcon, PauseIcon, PlayIcon, FileIcon, ImageIcon, MusicIcon,
    UploadCloudIcon,
} from 'lucide-vue-next';

const store = useDownloadStore();
const uploadStore = useUploadStore();
const router = useRouter();
const menuOpen = ref(false);
const menuEl = ref<HTMLElement | null>(null);
/** 流式传输分区是否折叠（默认展开，便于看到进行中） */
const streamingCollapsed = ref(false);

const EDGE_MARGIN = 16;
const PANEL_LEFT_OFFSET = 80;
const PANEL_BOTTOM_OFFSET = 16;
const PANEL_MIN_HEIGHT = 320;
const PANEL_MIN_WIDTH = 280;

function getContentTopY(): number {
    const titleBar = document.querySelector<HTMLElement>("[data-tauri-drag-region]");
    if (titleBar) {
        const r = titleBar.getBoundingClientRect();
        if (r.height > 0 && r.bottom > 0) return r.bottom + EDGE_MARGIN;
    }
    return EDGE_MARGIN;
}

const PANEL_MAX_HEIGHT = () =>
    window.innerHeight - PANEL_BOTTOM_OFFSET - getContentTopY();
const PANEL_MAX_WIDTH = () => window.innerWidth - PANEL_LEFT_OFFSET - EDGE_MARGIN;

function clampPanelSize(w: number, h: number): { width: number; height: number } {
    return {
        width: Math.min(Math.max(w, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH()),
        height: Math.min(Math.max(h, PANEL_MIN_HEIGHT), PANEL_MAX_HEIGHT()),
    };
}

function getInitialPanelHeight(): number {
    const saved = Number(localStorage.getItem("tdgram_download_panel_height"));
    if (Number.isFinite(saved) && saved >= PANEL_MIN_HEIGHT) return saved;
    return 420;
}
const panelHeightPx = ref<number>(getInitialPanelHeight());

function getInitialPanelWidth(): number {
    const saved = Number(localStorage.getItem("tdgram_download_panel_width"));
    if (Number.isFinite(saved) && saved >= PANEL_MIN_WIDTH) return saved;
    return 384;
}
const panelWidthPx = ref<number>(getInitialPanelWidth());

const isResizing = ref(false);
const panelEl = ref<HTMLElement | null>(null);
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;

function startCornerResize(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartWidth = panelWidthPx.value;
    resizeStartHeight = panelHeightPx.value;
    isResizing.value = true;
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onCornerResizeMove);
    document.addEventListener("mouseup", stopResize);
}

function onCornerResizeMove(e: MouseEvent) {
    const widthDelta = e.clientX - resizeStartX;
    const heightDelta = resizeStartY - e.clientY;
    const nextWidth = resizeStartWidth + widthDelta;
    const nextHeight = resizeStartHeight + heightDelta;
    const size = clampPanelSize(nextWidth, nextHeight);
    panelWidthPx.value = size.width;
    panelHeightPx.value = size.height;
}

function stopResize() {
    if (!isResizing.value) return;
    isResizing.value = false;
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onCornerResizeMove);
    document.removeEventListener("mouseup", stopResize);
    try {
        localStorage.setItem("tdgram_download_panel_height", String(panelHeightPx.value));
        localStorage.setItem("tdgram_download_panel_width", String(panelWidthPx.value));
    } catch (e) {
        console.warn("Failed to persist panel size:", e);
    }
}

function applyClampedSize() {
    const size = clampPanelSize(panelWidthPx.value, panelHeightPx.value);
    if (size.width !== panelWidthPx.value) panelWidthPx.value = size.width;
    if (size.height !== panelHeightPx.value) panelHeightPx.value = size.height;
}

const panelStyle = computed(() => {
    const size = clampPanelSize(panelWidthPx.value, panelHeightPx.value);
    return { width: size.width + "px", height: size.height + "px" };
});

onMounted(() => {
    applyClampedSize();
    window.addEventListener("resize", applyClampedSize);
});
onUnmounted(() => {
    stopResize();
    window.removeEventListener("resize", applyClampedSize);
});

/** 通过过滤器放行通用资源与自动下载图片 */
async function revealGenericViaFilter() {
    store.setFilterKey(FILTER_KEY.GENERIC, true);
    store.setFilterKey(FILTER_KEY.AUTO_IMAGE, true);
    menuOpen.value = false;
}

async function confirmCancelAll() {
    const count = store.pendingItems.length + store.streamingItems.length;
    const ok = window.confirm(`确定要取消全部 ${count} 个下载任务吗？`);
    if (!ok) return;
    await store.cancelAllDownloads();
}

const hiddenActiveCount = computed(() => store.hiddenActiveCount);

const COMPLETED_PAGE_SIZE = 30;
const completedLimit = ref(COMPLETED_PAGE_SIZE);
const completedHasMore = computed(
    () => store.completedItems.length > completedLimit.value
);
const displayCompletedItems = computed(() =>
    store.completedItems.slice(0, completedLimit.value)
);
watch(
    () => [store.filterKeys, store.completedItems.length] as const,
    () => {
        completedLimit.value = COMPLETED_PAGE_SIZE;
    }
);
function loadMoreCompleted() {
    completedLimit.value += COMPLETED_PAGE_SIZE;
}

async function revealFile(item: DownloadItem) {
    const localPath = item.local_path;
    if (!localPath) return;
    try {
        await revealItemInDir([localPath]);
    } catch (e) {
        console.error("revealItemInDir failed:", e);
    }
}

async function openFile(item: DownloadItem) {
    const localPath = item.local_path;
    if (!localPath) return;
    try {
        await openPath(localPath);
    } catch (e) {
        console.error("openPath failed:", e);
    }
}

function openChat(item: DownloadItem) {
    if (!item.chat_id) return;
    const query: Record<string, string> = {};
    if (item.message_id) query.message = String(item.message_id);
    router.push({
        name: "chat-detail",
        params: { id: String(item.chat_id) },
        query,
    });
}

function openInPlayer(item: DownloadItem) {
    if (!item.chat_id || !item.message_id) return;
    const action = item.file_type === "audio" ? "audio" : "photo";
    router.push({
        name: "chat-detail",
        params: { id: String(item.chat_id) },
        query: { message: String(item.message_id), open: action },
    });
}

function canOpenInPlayer(item: DownloadItem): boolean {
    if (!item.is_completed) return false;
    return item.file_type === "audio" || item.file_type === "photo" || item.file_type === "video";
}

function onCompletedClick(item: DownloadItem) {
    if (canOpenInPlayer(item)) {
        openInPlayer(item);
    }
}

function buildItemMenu(item: DownloadItem): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];

    if (item.chat_id) {
        items.push({
            key: "chat",
            label: "跳转到对应对话",
            icon: MessageCircleIcon,
            onClick: () => openChat(item),
        });
    }
    if (item.file_type === "audio" || item.file_type === "photo" || item.file_type === "video") {
        items.push({
            key: "play",
            label: item.file_type === "audio" ? "用播放器播放" : "在播放器中打开",
            icon: item.file_type === "audio" ? MusicIcon : ImageIcon,
            onClick: () => openInPlayer(item),
        });
    }

    if (item.local_path) {
        items.push({
            key: "reveal",
            label: "打开文件位置",
            icon: FolderOpenIcon,
            divider: items.length > 0,
            onClick: () => revealFile(item),
        });
        if (item.is_completed) {
            items.push({
                key: "open",
                label: "打开文件",
                icon: FileIcon,
                onClick: () => openFile(item),
            });
        }
    }

    if (!item.is_completed) {
        items.push({
            key: "pause",
            label: item.is_paused ? "继续下载" : "暂停下载",
            icon: item.is_paused ? PlayIcon : PauseIcon,
            divider: items.length > 0,
            onClick: () => store.togglePause(item.file_id),
        });
        items.push({
            key: "cancel",
            label: "取消下载",
            icon: TrashIcon,
            danger: true,
            onClick: () => store.cancelDownload(item.file_id),
        });
    }

    if (item.is_completed) {
        items.push({
            key: "dismiss",
            label: "从列表移除",
            icon: TrashIcon,
            danger: true,
            divider: items.length > 0,
            onClick: () => store.dismissItem(item.remote_id || item.file_id),
        });
    }

    return items;
}

function onItemContextMenu(event: MouseEvent, item: DownloadItem) {
    event.preventDefault();
    event.stopPropagation();
    openContextMenu(
        event.clientX,
        event.clientY,
        buildItemMenu(item),
        event.currentTarget as HTMLElement | null,
        { item },
    );
}

function buildUploadMenu(item: DownloadItem): ContextMenuItem[] {
    return [
        {
            key: "dismiss",
            label: "从列表移除",
            icon: TrashIcon,
            danger: true,
            onClick: () => uploadStore.dismiss(item.file_id),
        },
    ];
}

function onUploadContextMenu(event: MouseEvent, item: DownloadItem) {
    event.preventDefault();
    event.stopPropagation();
    openContextMenu(
        event.clientX,
        event.clientY,
        buildUploadMenu(item),
        event.currentTarget as HTMLElement | null,
        { item },
    );
}

function setMenuRef(el: any) {
    menuEl.value = el as HTMLElement;
}

function onClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (menuOpen.value && menuEl.value && !menuEl.value.contains(target)) {
        menuOpen.value = false;
    }
}

onMounted(() => document.addEventListener('click', onClickOutside));
onUnmounted(() => document.removeEventListener('click', onClickOutside));
</script>

<style scoped>
.dl-panel-enter-active,
.dl-panel-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.dl-panel-enter-from,
.dl-panel-leave-to {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
}

.resizing {
    border: 1px solid rgba(59, 130, 246, 0.6);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
    border-radius: 12px;
}
</style>
