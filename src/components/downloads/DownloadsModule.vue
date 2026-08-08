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
                            <template v-if="store.downloadingItems.length > 0 && store.pausedItems.length === 0">
                                {{ store.downloadingItems.length }} 个文件正在下载
                            </template>
                            <template v-else-if="store.downloadingItems.length > 0">
                                {{ store.downloadingItems.length }} 个文件正在下载，{{ store.pausedItems.length }} 个已暂停
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
                    <!-- 三点菜单 + 关闭 -->
                    <div class="relative flex items-center gap-1 pr-1" :ref="setMenuRef">
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
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="2">
                                        <path v-if="!store.showHidden"
                                            d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                                        <line v-if="!store.showHidden" x1="1" y1="1" x2="23" y2="23" />
                                        <path v-if="store.showHidden"
                                            d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle v-if="store.showHidden" cx="12" cy="12" r="3" />
                                    </svg>
                                    {{ store.showHidden ? '隐藏通用资源' : '显示隐藏的通用资源' }}
                                    <span v-if="store.hasHiddenActive && !store.showHidden"
                                        class="ml-auto text-xs text-gray-400">({{
                                            hiddenGenericsCount }})</span>
                                </button>
                                <!-- 显示自动下载图片（独立的隐藏开关） -->
                                <button type="button" @click="store.toggleShowAutoPhotos(); menuOpen = false"
                                    class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="2">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                        <path d="M7 10l4 4 9-9" />
                                        <line x1="1" y1="1" x2="23" y2="23" v-if="!store.showAutoPhotos" />
                                    </svg>
                                    {{ store.showAutoPhotos ? '隐藏自动下载图片' : '显示自动下载图片' }}
                                    <span v-if="store.hasHiddenAutoPhotos && !store.showAutoPhotos"
                                        class="ml-auto text-xs text-gray-400">({{ hiddenAutoPhotosCount }})</span>
                                </button>
                                <hr class="my-1 border-gray-200 dark:border-gray-700" />
                                <button type="button" @click="store.clearCompleted(); menuOpen = false"
                                    class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="2">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path
                                            d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                    </svg>
                                    清除已完成
                                </button>
                                <!-- 取消全部下载（仅当存在进行中/暂停任务时显示） -->
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
                        <!-- 关闭面板 -->
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

                <!-- 隐藏资源提示条 -->
                <div v-if="store.hasHiddenActive && !store.showHidden"
                    class="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800/30 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                    <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                    <span>有 {{ hiddenGenericsCount }} 个通用资源下载已隐藏</span>
                    <button type="button" @click="store.showHidden = true"
                        class="ml-auto font-medium hover:underline shrink-0">查看</button>
                </div>

                <!-- 自动下载图片隐藏提示条（独立开关） -->
                <div v-if="store.hasHiddenAutoPhotos && !store.showAutoPhotos"
                    class="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-800/30 flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
                    <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                    </svg>
                    <span>有 {{ hiddenAutoPhotosCount }} 个自动下载图片已隐藏</span>
                    <button type="button" @click="store.toggleShowAutoPhotos()"
                        class="ml-auto font-medium hover:underline shrink-0">查看</button>
                </div>

                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar" v-smooth-wheel>
                    <!-- 正在下载 -->
                    <div v-if="store.downloadingItems.length > 0" class="py-2">
                        <div class="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                            正在下载
                        </div>
                        <DownloadRow v-for="item in store.downloadingItems" :key="item.file_id" :item="item"
                            :can-open-in-player="false" @toggle-pause="store.togglePause" @cancel="store.cancelDownload"
                            @item-context-menu="onItemContextMenu" />
                    </div>

                    <!-- 已暂停 -->
                    <div v-if="store.pausedItems.length > 0" class="py-2">
                        <div class="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            已暂停
                            <span class="normal-case text-[10px] text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/40 px-1.5 rounded">
                                {{ store.pausedItems.length }}
                            </span>
                        </div>
                        <DownloadRow v-for="item in store.pausedItems" :key="item.file_id" :item="item"
                            :can-open-in-player="false" @toggle-pause="store.togglePause" @cancel="store.cancelDownload"
                            @item-context-menu="onItemContextMenu" />
                    </div>

                    <!-- 已完成 -->
                    <div v-if="store.completedItems.length > 0" class="py-2">
                        <div class="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                            已完成
                        </div>
                        <DownloadRow v-for="item in store.completedItems" :key="item.file_id" :item="item"
                            :can-open-in-player="canOpenInPlayer(item)" @dismiss="store.dismissItem"
                            @open-in-player="onCompletedClick" @item-context-menu="onItemContextMenu" />
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
                            <button type="button" @click="revealAllHidden()" class="hover:underline">
                                {{ hiddenActiveCount }} 个隐藏下载被隐藏，点击查看
                            </button>
                        </p>
                    </div>
                </div>

                <!-- 右上角对角拖拽调整大小手柄（面板锚定左下角，右上角自由 → nesw 方向） -->
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
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useDownloadStore, type DownloadItem } from "../../store/downloads";
import DownloadRow from "./DownloadRow.vue";
import { openContextMenu } from "../../store/contextMenu";
import type { ContextMenuItem } from "../../components/contextMenu/types";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import {
    MessageCircleIcon, FolderOpenIcon, TrashIcon, PauseIcon, PlayIcon, FileIcon, ImageIcon, MusicIcon,
} from 'lucide-vue-next';

const store = useDownloadStore();
const router = useRouter();
const menuOpen = ref(false);
const menuEl = ref<HTMLElement | null>(null);

// ─── 面板可拖拽调整大小（右上角对角拖拽） ─────────────────────
/** 面板与主窗口边框之间的最小边距（px） */
const EDGE_MARGIN = 16;
/** 面板左侧固定定位偏移（left-20 = 80px） */
const PANEL_LEFT_OFFSET = 80;
/** 面板底部固定定位偏移（bottom-4 = 16px） */
const PANEL_BOTTOM_OFFSET = 16;
/** 面板的最小高度，保证标题栏和右键菜单能完整显示 */
const PANEL_MIN_HEIGHT = 320;
/** 面板的最小宽度 */
const PANEL_MIN_WIDTH = 280;

/** 主内容区（HomeView）的顶部 y 坐标 = 标题栏底部（若已渲染），否则按顶部边距兜底 */
function getContentTopY(): number {
    const titleBar = document.querySelector<HTMLElement>("[data-tauri-drag-region]");
    if (titleBar) {
        const r = titleBar.getBoundingClientRect();
        if (r.height > 0 && r.bottom > 0) return r.bottom + EDGE_MARGIN;
    }
    return EDGE_MARGIN;
}

/**
 * 面板的最大高度：顶部不超出 HomeView 区域（标题栏之下），底部保留边距。
 * 面板锚定在底部（bottom-4），故 maxY = 视口高 - 底部偏移，
 * 高度上限 = maxY - HomeView顶部y。
 */
const PANEL_MAX_HEIGHT = () =>
    window.innerHeight - PANEL_BOTTOM_OFFSET - getContentTopY();
/** 面板的最大宽度：不超出视口右侧边距 */
const PANEL_MAX_WIDTH = () => window.innerWidth - PANEL_LEFT_OFFSET - EDGE_MARGIN;

/** 将宽高同时约束到面板允许的最小/最大范围内 */
function clampPanelSize(w: number, h: number): { width: number; height: number } {
    return {
        width: Math.min(Math.max(w, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH()),
        height: Math.min(Math.max(h, PANEL_MIN_HEIGHT), PANEL_MAX_HEIGHT()),
    };
}

/** 面板高度（px），持久化到 localStorage，默认 420 */
function getInitialPanelHeight(): number {
    const saved = Number(localStorage.getItem("tdgram_download_panel_height"));
    if (Number.isFinite(saved) && saved >= PANEL_MIN_HEIGHT) return saved;
    return 420;
}
const panelHeightPx = ref<number>(getInitialPanelHeight());

/** 面板宽度（px），持久化到 localStorage，默认 384（24rem） */
function getInitialPanelWidth(): number {
    const saved = Number(localStorage.getItem("tdgram_download_panel_width"));
    if (Number.isFinite(saved) && saved >= PANEL_MIN_WIDTH) return saved;
    return 384;
}
const panelWidthPx = ref<number>(getInitialPanelWidth());

/** 正在拖拽调整大小 */
const isResizing = ref(false);
const panelEl = ref<HTMLElement | null>(null);
/** 拖拽起始时的鼠标坐标与面板宽高（用于计算增量） */
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;

/**
 * 开始从右上角对角拖拽调整大小。
 * 面板固定在左下角（bottom-4 left-20），因此：
 *  - 高度由顶部边缘决定：鼠标上移增高（deltaY = 起始Y - 当前Y）
 *  - 宽度由右侧边缘决定：鼠标右移增宽（deltaX = 当前X - 起始X）
 */
function startCornerResize(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartWidth = panelWidthPx.value;
    resizeStartHeight = panelHeightPx.value;
    isResizing.value = true;
    // 拖拽中禁用文本选择
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
    // 持久化宽高，下次打开保持（已经 clamp 过，保证不超边界）
    try {
        localStorage.setItem("tdgram_download_panel_height", String(panelHeightPx.value));
        localStorage.setItem("tdgram_download_panel_width", String(panelWidthPx.value));
    } catch (e) {
        // localStorage 不可用时忽略
        console.warn("Failed to persist panel size:", e);
    }
}

/** 若当前尺寸超过屏幕边界（例如窗口被缩小或历史值偏大），压缩回允许范围内 */
function applyClampedSize() {
    const size = clampPanelSize(panelWidthPx.value, panelHeightPx.value);
    if (size.width !== panelWidthPx.value) panelWidthPx.value = size.width;
    if (size.height !== panelHeightPx.value) panelHeightPx.value = size.height;
}

/** 渲染时按当前视口 clamp 的样式（兜底保证，打开面板时不超边界） */
const panelStyle = computed(() => {
    const size = clampPanelSize(panelWidthPx.value, panelHeightPx.value);
    return { width: size.width + "px", height: size.height + "px" };
});

/** 挂载时按当前视口压缩一次，并监听窗口尺寸变化时实时压缩 */
onMounted(() => {
    applyClampedSize();
    window.addEventListener("resize", applyClampedSize);
});
onUnmounted(() => {
    stopResize();
    window.removeEventListener("resize", applyClampedSize);
});

/** 一键显示所有隐藏项（通用资源 + 自动下载图片） */
async function revealAllHidden() {
    if (!store.showHidden) await store.toggleShowHidden();
    if (!store.showAutoPhotos) await store.toggleShowAutoPhotos();
    menuOpen.value = false;
}

/** 点击「取消全部下载」：二次确认后取消所有进行中/暂停任务 */
async function confirmCancelAll() {
    const count = store.pendingItems.length;
    const ok = window.confirm(`确定要取消全部 ${count} 个下载任务吗？`);
    if (!ok) return;
    await store.cancelAllDownloads();
}

/**
 * 已隐藏资源的统计数据 —— 一次遍历算出三个数量，避免多个 computed 各自
 * Object.values(store.items) 重复遍历（条目很多时是性能热点）。
 */
const hiddenStats = computed(() => {
    let generics = 0;      // 通用资源进行中的数量
    let autoPhotos = 0;    // 自动下载图片进行中的数量
    let active = 0;        // 隐藏（通用 + 自动图片）进行中的总数量
    for (const i of Object.values(store.items)) {
        if (i.dismissed || i.is_completed) continue;
        if (i.is_generic) generics++;
        if (i.is_auto_photo) autoPhotos++;
        if (i.is_generic || i.is_auto_photo) active++;
    }
    return { generics, autoPhotos, active };
});

/** 已隐藏（通用资源）的进行中下载数量 */
const hiddenGenericsCount = computed(() => hiddenStats.value.generics);

/** 已隐藏（自动下载图片）的进行中下载数量 */
const hiddenAutoPhotosCount = computed(() => hiddenStats.value.autoPhotos);

/** 隐藏（通用资源 + 自动下载图片）的进行中下载总数量 */
const hiddenActiveCount = computed(() => hiddenStats.value.active);

/** 打开文件所在位置（文件管理器定位） */
async function revealFile(item: DownloadItem) {
    const localPath = item.local_path;
    if (!localPath) return;
    try {
        await revealItemInDir([localPath]);
    } catch (e) {
        console.error("revealItemInDir failed:", e);
    }
}

/** 用系统默认程序打开文件 */
async function openFile(item: DownloadItem) {
    const localPath = item.local_path;
    if (!localPath) return;
    try {
        await openPath(localPath);
    } catch (e) {
        console.error("openPath failed:", e);
    }
}

/** 跳转到该下载项对应的对话（并定位到对应消息） */
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

/** 在播放器中直接打开媒体（图片/视频 → 媒体查看器，音乐 → 音频播放器） */
function openInPlayer(item: DownloadItem) {
    if (!item.chat_id || !item.message_id) return;
    const action = item.file_type === "audio" ? "audio" : "photo";
    router.push({
        name: "chat-detail",
        params: { id: String(item.chat_id) },
        query: { message: String(item.message_id), open: action },
    });
}

/** 已完成条目是否可在播放器中点击打开（音乐/图片/视频） */
function canOpenInPlayer(item: DownloadItem): boolean {
    if (!item.is_completed) return false;
    return item.file_type === "audio" || item.file_type === "photo" || item.file_type === "video";
}

/** 点击已完成条目：音乐/图片/视频直接在播放器中打开 */
function onCompletedClick(item: DownloadItem) {
    if (canOpenInPlayer(item)) {
        openInPlayer(item);
    }
}

/** 构建下载项的右键菜单 */
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
            onClick: () => store.dismissItem(item.file_id),
        });
    }

    return items;
}

/** 下载项的右键点击 */
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
</script>

<style scoped>
/* 下载面板（左下角悬浮窗）展开/收起过渡 */
.dl-panel-enter-active,
.dl-panel-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.dl-panel-enter-from,
.dl-panel-leave-to {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
}

/* 拖拽调整大小时强化边框反馈，弱化圆角（贴近视口顶部时更自然） */
.resizing {
    border: 1px solid rgba(59, 130, 246, 0.6);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
    border-radius: 12px;
}
</style>
