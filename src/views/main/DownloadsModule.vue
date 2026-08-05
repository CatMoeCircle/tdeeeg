<template>
    <!-- 下载管理器：左下角悬浮窗 -->
    <Teleport to="body">
        <Transition name="dl-panel">
            <div v-if="store.isPanelOpen"
                class="fixed bottom-4 left-20 z-50 w-96 max-h-[70vh] flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <!-- 标题栏 -->
                <div
                    class="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
                    <div class="min-w-0">
                        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">下载管理器</h2>
                        <p class="text-xs text-gray-500 mt-0.5">
                            <template v-if="store.activeCount > 0">
                                {{ store.activeCount }} 个文件正在下载
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
                    <div class="relative flex items-center gap-1" :ref="setMenuRef">
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
                    <!-- 进行中/暂停 -->
                    <div v-if="store.pendingItems.length > 0" class="py-2">
                        <div class="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                            进行中
                        </div>
                        <div v-for="item in store.pendingItems" :key="item.file_id"
                            class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                            @contextmenu.prevent="onItemContextMenu($event, item)">
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
                                <div v-else class="w-full h-full flex items-center justify-center"
                                    :class="iconBgClass(item)">
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
                                <div
                                    class="mt-1.5 w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full transition-all duration-300"
                                        :class="item.is_paused ? 'bg-yellow-400' : 'bg-blue-500'"
                                        :style="{ width: Math.min(100, item.progress * 100) + '%' }">
                                    </div>
                                </div>
                            </div>

                            <span class="text-xs text-gray-400 shrink-0 w-10 text-right">{{ (item.progress *
                                100).toFixed(0)
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
                                    <svg class="w-4 h-4 text-gray-400 hover:text-red-500" viewBox="0 0 24 24"
                                        fill="none" stroke="currentColor" stroke-width="2">
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
                            class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                            :class="{ 'cursor-pointer': canOpenInPlayer(item) }" @click="onCompletedClick(item)"
                            @contextmenu.prevent="onItemContextMenu($event, item)">
                            <!-- 完整展示 -->
                            <div class="w-11 h-11 rounded-lg overflow-hidden shrink-0">
                                <img v-if="item.local_path && (item.file_type === 'photo' || item.file_type === 'video')"
                                    :src="toAssetUrl(item.local_path)"
                                    class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
                                <img v-else-if="item.thumbnail_data_url" :src="item.thumbnail_data_url"
                                    class="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
                                <div v-else
                                    class="w-full h-full flex items-center justify-center bg-green-100 dark:bg-green-900">
                                    <svg class="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" stroke-width="2">
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
                            <button type="button" @click.stop="store.dismissItem(item.file_id)"
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
                            <button type="button" @click="revealAllHidden()" class="hover:underline">
                                {{ hiddenActiveCount }} 个隐藏下载被隐藏，点击查看
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useDownloadStore, type DownloadFileType, type DownloadItem } from "../../store/downloads";
import { openContextMenu } from "../../store/contextMenu";
import type { ContextMenuItem } from "../../components/contextMenu/types";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
    FileIcon, ImageIcon, VideoIcon, MusicIcon, MicIcon,
    MessageCircleIcon, FolderOpenIcon, TrashIcon, PauseIcon, PlayIcon,
} from 'lucide-vue-next';
import type { Component } from "vue";

const store = useDownloadStore();
const router = useRouter();
const menuOpen = ref(false);
const menuEl = ref<HTMLElement | null>(null);

/** 一键显示所有隐藏项（通用资源 + 自动下载图片） */
async function revealAllHidden() {
    if (!store.showHidden) await store.toggleShowHidden();
    if (!store.showAutoPhotos) await store.toggleShowAutoPhotos();
    menuOpen.value = false;
}

/** 已隐藏（通用资源）的进行中下载数量 —— 模板中多处引用，缓存避免每次渲染重复 filter */
const hiddenGenericsCount = computed(() =>
    store.pendingItems.filter((i) => i.is_generic).length
);

/** 已隐藏（自动下载图片）的进行中下载数量 */
const hiddenAutoPhotosCount = computed(() => {
    return Object.values(store.items).filter(
        (i) => i.is_auto_photo && !i.is_completed && !i.dismissed
    ).length;
});

/** 隐藏（通用资源 + 自动下载图片）的进行中下载总数量 */
const hiddenActiveCount = computed(() =>
    Object.values(store.items).filter(
        (i) => (i.is_generic || i.is_auto_photo) && !i.is_completed && !i.dismissed
    ).length
);

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
</style>
