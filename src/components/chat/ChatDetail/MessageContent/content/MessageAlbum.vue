<template>
    <div ref="rootEl" class="overflow-hidden" :class="borderRadiusClass">
        <div v-if="layoutItems.length > 0" class="relative" :style="containerStyle">
            <div v-for="item in layoutItems" :key="item.msgId"
                class="absolute overflow-hidden cursor-pointer bg-gray-200 dark:bg-gray-700"
                :class="{ 'bg-black': item.isVideo }" :style="item.style" @click="openViewer(item.index)"
                @contextmenu.prevent.stop="onTileContextMenu($event, item.index)">
                <img v-if="item.thumbSrc" :src="item.thumbSrc"
                    class="absolute inset-0 w-full h-full object-cover"
                    :class="item.thumbIsBlur ? 'blur-sm scale-105' : ''" />
                <img v-if="item.mediaSrc && !item.isVideo && !item.isGif" :src="item.mediaSrc"
                    class="absolute inset-0 w-full h-full object-cover" />
                <video v-if="item.mediaSrc && item.isGif" :src="item.mediaSrc" autoplay loop muted playsinline
                    class="absolute inset-0 w-full h-full object-cover" />
                <div v-if="!item.thumbSrc && !item.mediaSrc" class="absolute inset-0 flex items-center justify-center">
                    <svg v-if="item.isVideo" class="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="1.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <svg v-else class="w-6 h-6 text-gray-400 animate-pulse" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                    </svg>
                </div>
                <div v-if="item.isVideo" class="absolute inset-0 flex items-center justify-center bg-black/10">
                    <div class="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 text-white ml-0.5">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
                <span v-if="item.isGif"
                    class="absolute top-1 left-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded leading-none select-none pointer-events-none uppercase tracking-wide">
                    GIF
                </span>
                <span v-if="item.isVideo && item.duration > 0"
                    class="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded leading-none select-none">
                    {{ formatDuration(item.duration) }}
                </span>
            </div>
            <!-- 无描述时：时间状态以胶囊叠加在相册右下角，不占底部独立行 -->
            <div v-if="!captionText && lastDate"
                class="absolute right-1.5 bottom-1.5 bg-black/60 text-white px-1.5 py-0.5 rounded-md leading-none select-none pointer-events-none flex items-center">
                <MessageStatus :date="lastDate" :isOutgoing="isSelf" :sendingState="lastSendingState" :isRead="isRead"
                    :viewCount="lastViewCount" :authorSignature="authorSignature" overMedia />
            </div>
        </div>
        <div v-if="captionText" class="px-2 pt-1.5 pb-2"
            :class="isSelf ? 'text-gray-900' : 'text-gray-800 dark:text-gray-200'">
            <MessageTextContent :formattedText="captionFormatted" :chatId="chatId" />
        </div>
        <!-- Reactions slot（caption 与时间之间） -->
        <slot name="reactions" />
        <span v-if="captionText" class="block text-right px-2 pb-1" :class="isSelf ? 'text-black/50' : 'text-gray-400'">
            <MessageStatus :date="lastDate" :isOutgoing="isSelf" :sendingState="lastSendingState" :isRead="isRead"
                :viewCount="lastViewCount" :authorSignature="authorSignature" />
        </span>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue';
import type { message } from 'tdlib-types';
import { convertFileSrc } from '@tauri-apps/api/core';
import { tdlibSend, isFileReady, downloadingFiles, safeDownloadFile } from '../../../../../utils/tdlib';
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import MessageStatus from './MessageStatus.vue';
import MessageTextContent from './MessageTextContent.vue';
import { layoutMediaGroup, type MediaGroupSize } from '../../../../../utils/mediaGroupLayout';
import { openMediaViewer } from '../../../../../store/mediaViewer';
import { useDownloadStore, remoteIdOf } from '../../../../../store/downloads';
import { DL_TAG } from '../../../../../utils/downloadTags';
import { settings } from '../../../../../store/settings';
import { getChatCategory, shouldAutoDownloadPhotos } from '../../../../../utils/autoDownload';
import { pickSmallPhotoSize, pickBigPhotoSize, pickBigPhotoDimensions } from '../../../../../utils/photoSizes';
import { isThumbnailImgRenderable } from '../../../../../utils/thumbnail';
import { useChatStore } from '../../../../../store/chat';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';

const props = defineProps<{
    messages: message[];
    isSelf: boolean;
    chatId?: number;
    /** 话题 ID（论坛话题，传递给媒体查看器） */
    topicId?: number;
    authorSignature?: string;
    isRead?: boolean;
}>();

/**
 * 右击相册中的某条具体媒体时向上冒泡该消息与坐标，便于外层针对「被点击的那一条」
 * 而不是相册第一条构造右键菜单。
 */
const emit = defineEmits<{
    (e: 'messageContextMenu', msg: message, x: number, y: number): void;
}>();

/** 相册某一块媒体被右键：取出对应的那一条消息并冒泡 */
function onTileContextMenu(e: MouseEvent, idx: number) {
    const msg = props.messages[idx];
    if (!msg) return;
    emit('messageContextMenu', msg, e.clientX, e.clientY);
}

// ---- Refs ----
const thumbCache = reactive<Record<number, string>>({});
const mediaCache = reactive<Record<number, string>>({});

/**
 * 加载代次：消息内容引用变化 / 相册重组时自增。
 * 旧内容在途的 downloadFile/getFile 完成后必须比对代次再写缓存，否则旧缩略图会串到新内容。
 */
let albumLoadSeq = 0;

/**
 * 记录上一次构建时每条消息的对象引用，用于检测「同一 msg.id 的内容被原地替换」。
 * TDLib 的 updateMessageContent 会原地替换 msg.content（引用变化但 id 不变），
 * 组件不会重挂载，而 thumbCache/mediaCache 又带 !cache[id] 守卫永不刷新，导致
 * 相册缩略图/大图显示成旧内容（串图）。只要内容对象引用变化，就作废旧缓存。
 */
let prevAlbumMsgRefs = new Map<number, message>();

/** 清理内容已被替换的消息的旧缩略图/大图缓存，并更新引用快照 */
function invalidateAlbumCaches(msgs: message[]) {
    const next = new Map<number, message>();
    for (const m of msgs) {
        const prev = prevAlbumMsgRefs.get(m.id);
        if (prev && prev !== m) {
            delete thumbCache[m.id];
            delete mediaCache[m.id];
        } else if (!prev) {
            // 首次见到该消息：清掉可能残留的占位缓存（防御性）
            delete thumbCache[m.id];
            delete mediaCache[m.id];
        }
        next.set(m.id, m);
    }
    prevAlbumMsgRefs = next;
}

/** 相册根元素（用于视口门控：进入视口才下载） */
const rootEl = ref<HTMLElement | null>(null);

/**
 * 立即设置 base64 缩略图预览（不下载），供离屏相册显示占位。
 * 仅填充 minithumbnail base64，避免任何 TDLib 下载。
 */
function setAlbumPreview() {
    for (const msg of props.messages) {
        const c = msg.content;
        const min = c._ === 'messagePhoto'
            ? c.photo.minithumbnail
            : c._ === 'messageVideo'
                ? (c.cover?.minithumbnail || c.video.minithumbnail)
                : undefined;
        if (min?.data && !thumbCache[msg.id]) {
            thumbCache[msg.id] = `data:image/jpeg;base64,${min.data}`;
        }
    }
}

/**
 * 加载时立刻套用 content 内已就绪资源（高清封面 / Small / 视频 / GIF），
 * 不经过视口、不触发下载。高清可用时覆盖 mini。
 * 视口门控只负责「未就绪时是否发起下载」。
 */
function applyAlbumReadyFromContent(msgs: message[] = props.messages): boolean {
    if (!msgs?.length) return false;
    let changed = false;
    for (const msg of msgs) {
        const c = msg.content;
        if (c._ === 'messagePhoto') {
            const small = pickSmallPhotoSize(c.photo);
            const big = pickBigPhotoSize(c.photo);
            if (big && isFileReady(big) && big.local.path) {
                reconcileAlbumStore(big);
                if (mediaCache[msg.id] !== convertFileSrc(big.local.path)) {
                    mediaCache[msg.id] = convertFileSrc(big.local.path);
                    changed = true;
                }
            }
            // Small：Big 未就绪时作清晰占位；高清优先于 mini
            if (small && isFileReady(small) && small.local.path && !mediaCache[msg.id]) {
                reconcileAlbumStore(small);
                const src = convertFileSrc(small.local.path);
                if (thumbCache[msg.id] !== src || thumbIsMini[msg.id] !== false) {
                    thumbCache[msg.id] = src;
                    thumbIsMini[msg.id] = false;
                    changed = true;
                }
            }
        } else if (c._ === 'messageVideo') {
            const v = c.video.video;
            const th = c.video.thumbnail;
            const cover = th?.file;
            if (v && isFileReady(v) && v.local.path) {
                reconcileAlbumStore(v);
                const src = convertFileSrc(v.local.path);
                if (mediaCache[msg.id] !== src) {
                    mediaCache[msg.id] = src;
                    changed = true;
                }
            }
            // 高清封面可用 → 直接用，不保留 mini（与是否打开图片自动下载无关）
            if (cover && isFileReady(cover) && cover.local.path
                && isThumbnailImgRenderable(th?.format)) {
                const src = convertFileSrc(cover.local.path);
                if (thumbCache[msg.id] !== src || thumbIsMini[msg.id] !== false) {
                    thumbCache[msg.id] = src;
                    thumbIsMini[msg.id] = false;
                    changed = true;
                }
            }
            // 新版顶层 cover.photo：Small 就绪时作为清晰封面
            const coverSmall = pickSmallPhotoSize(c.cover);
            if (coverSmall && isFileReady(coverSmall) && coverSmall.local.path
                && !(cover && isFileReady(cover) && isThumbnailImgRenderable(th?.format))) {
                const src = convertFileSrc(coverSmall.local.path);
                if (thumbCache[msg.id] !== src || thumbIsMini[msg.id] !== false) {
                    thumbCache[msg.id] = src;
                    thumbIsMini[msg.id] = false;
                    changed = true;
                }
            }
        } else if (c._ === 'messageAnimation') {
            const a = c.animation.animation;
            const th = c.animation.thumbnail;
            const cover = th?.file;
            if (a && isFileReady(a) && a.local.path) {
                const src = convertFileSrc(a.local.path);
                if (mediaCache[msg.id] !== src) {
                    mediaCache[msg.id] = src;
                    changed = true;
                }
            }
            if (cover && isFileReady(cover) && cover.local.path
                && isThumbnailImgRenderable(th?.format)) {
                const src = convertFileSrc(cover.local.path);
                if (thumbCache[msg.id] !== src || thumbIsMini[msg.id] !== false) {
                    thumbCache[msg.id] = src;
                    thumbIsMini[msg.id] = false;
                    changed = true;
                }
            }
        }
    }
    return changed;
}

function openViewer(idx: number) {
    const msg = props.messages[idx];
    if (msg) {
        openMediaViewer({
            messageId: msg.id,
            chatId: props.chatId,
            topicId: props.topicId,
            message: msg,
        }, 0);
    }
}

// ---- Layout types ----
interface LayoutItem {
    msgId: number; index: number; isVideo: boolean; isGif: boolean; duration: number;
    aspect: number; style: string; thumbSrc: string | null; mediaSrc: string | null;
    /** thumbSrc 是否为 minithumbnail（需模糊）；Small 就绪后为 false */
    thumbIsBlur: boolean;
}

/** 记录各消息当前 thumb 是否仍是 minithumbnail */
const thumbIsMini = reactive<Record<number, boolean>>({});

function getMediaSize(msg: message): MediaGroupSize {
    const c = msg.content;
    if (c._ === 'messagePhoto') {
        return pickBigPhotoDimensions(c.photo);
    }
    if (c._ === 'messageVideo') {
        const { width, height } = c.video;
        return { width, height };
    }
    if (c._ === 'messageAnimation') {
        const { width, height } = c.animation;
        return { width, height };
    }
    return { width: 1, height: 1 };
}

const ALBUM_W = 340;

// ---- Refs ----
const layoutItems = ref<LayoutItem[]>([]);
const layoutSize = ref({ width: ALBUM_W, height: ALBUM_W });

// ---- Build layout ----
function rebuildLayout() {
    const msgs = props.messages;
    const n = msgs.length;
    if (n === 0) { layoutItems.value = []; return; }

    const sizes = msgs.map(m => getMediaSize(m));
    const aspects = sizes.map(size => size.width / Math.max(1, size.height));
    const isVideos = msgs.map(m => m.content._ === 'messageVideo');
    const durations = msgs.map(m => m.content._ === 'messageVideo' ? m.content.video.duration : 0);
    const layout = layoutMediaGroup(sizes, ALBUM_W);
    layoutSize.value = { width: layout.width, height: layout.height };

    const result: LayoutItem[] = [];
    for (let mi = 0; mi < layout.items.length; mi++) {
        const msg = msgs[mi];
        const item = layout.items[mi];
        // 同步注入 base64 minithumbnail 作为占位：相册图片/GIF 尚未加载出来前，
        // 立即用 base64 缩略图做模糊占位，避免出现空白的脉冲占位框。
        if (!thumbCache[msg.id]) {
            let mini: string | undefined;
            if (msg.content._ === 'messagePhoto') mini = msg.content.photo.minithumbnail?.data;
            else if (msg.content._ === 'messageAnimation') mini = msg.content.animation.minithumbnail?.data;
            if (mini) {
                thumbCache[msg.id] = `data:image/jpeg;base64,${mini}`;
                thumbIsMini[msg.id] = true;
            }
        }
        const isGif = msg.content._ === 'messageAnimation';
        result.push({
            msgId: msg.id, index: mi, isVideo: isVideos[mi], isGif, duration: durations[mi], aspect: aspects[mi],
            style: `top:${item.y / layout.height * 100}%;left:${item.x / layout.width * 100}%;width:${item.width / layout.width * 100}%;height:${item.height / layout.height * 100}%;`,
            thumbSrc: thumbCache[msg.id] || null, mediaSrc: mediaCache[msg.id] || null,
            thumbIsBlur: thumbIsMini[msg.id] !== false && !!thumbCache[msg.id]?.startsWith('data:'),
        });
    }
    layoutItems.value = result;
}

// Container height
const containerStyle = computed(() => {
    if (layoutItems.value.length === 0) return {};
    return {
        width: `${ALBUM_W}px`,
        maxWidth: '100%',
        aspectRatio: `${layoutSize.value.width} / ${layoutSize.value.height}`,
    };
});

// ---- React to messages ----
watch(() => props.messages, () => rebuildLayout(), { immediate: true, deep: true });

/**
 * 以受限并发执行一组异步任务，避免相册内图片被 for...of await 串行下载。
 * 生产环境每个 RPC（downloadFile/getFile）延迟更高，串行瀑布会把整个相册的
 * 加载时间逐张累加；并发加载能显著提速。限制并发数防止一次性灌爆 Rust 的单线程接收循环。
 */
async function limitConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<boolean>): Promise<boolean> {
    let changed = false;
    let next = 0;
    const runWorker = async (): Promise<void> => {
        while (next < items.length) {
            const index = next++;
            try {
                if (await worker(items[index])) changed = true;
            } catch (_) { /* 单条失败不影响其它 */ }
        }
    };
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(runWorker());
    await Promise.all(workers);
    return changed;
}

// ---- Thumbnail loading ----
// 相册内图片/视频改为受限并发加载（原 for...of await 是串行瀑布，放大了生产环境的 RPC 延迟）
// 视口门控：挂载时只设置 base64 预览，真正下载延迟到相册进入用户视口后。
let loadAlbumFn: ((msgs: message[]) => Promise<void>) | null = null;
function runAlbumLoad() {
    if (!loadAlbumFn) return;
    void loadAlbumFn(props.messages);
}

loadAlbumFn = async (msgs) => {
    const seq = albumLoadSeq;
    const changed = await limitConcurrency(msgs, 4, async (msg) => {
        if (seq !== albumLoadSeq) return false;
        const c = msg.content;
        if (c._ === 'messagePhoto') return await loadPhoto(msg, seq);
        if (c._ === 'messageVideo') return await loadVideo(msg, seq);
        if (c._ === 'messageAnimation') return await loadAnimation(msg, seq);
        return false;
    });
    if (seq !== albumLoadSeq) return;
    if (changed) rebuildLayout();
};

// 视口门控：进入视口触发下载；未进入只显示 setAlbumPreview 的 base64。
// entered 同时供 watch 判断是否应触发下载。
const { start: startViewportLoad, entered: albumEntered } = useViewportLoad(rootEl, () => {
    return runAlbumLoad();
});
watch(() => props.messages, (msgs) => {
    albumLoadSeq++;
    // 内容被原地替换（updateMessageContent）时作废旧缩略图/大图缓存，避免串图
    invalidateAlbumCaches(msgs);
    setAlbumPreview();
    // 就绪资源在加载时直接使用，不经过视口
    applyAlbumReadyFromContent(msgs);
    rebuildLayout();
    // 视口只闸「下载」：未就绪且已在视口才入队下载
    if (albumEntered.value) runAlbumLoad();
}, { immediate: true, deep: true });
onMounted(() => {
    setAlbumPreview();
    if (applyAlbumReadyFromContent()) rebuildLayout();
    startViewportLoad();
});

/**
 * 下载完成后按 TDLib 返回结果对账 store，并把本地路径写入相册缓存。
 * 异步下载时立即返回 false；完成态由 updateFile → 消息快照 deep watch → applyAlbumReadyFromContent 上屏。
 */
function reconcileAlbumStore(file: { id?: number; remote?: { id?: string }; local?: { path?: string; is_downloading_completed?: boolean } } | undefined | null) {
    if (!file) return;
    const downloadStore = useDownloadStore();
    downloadStore.reconcileFromFile(file as never);
}

async function loadPhoto(msg: message, seq: number): Promise<boolean> {
    if (msg.content._ !== 'messagePhoto') return false;
    if (seq !== albumLoadSeq) return false;
    const downloadStore = useDownloadStore();
    let c = false;
    const photo = msg.content.photo;
    if (photo.minithumbnail?.data && !thumbCache[msg.id]) {
        thumbCache[msg.id] = `data:image/jpeg;base64,${photo.minithumbnail.data}`;
        thumbIsMini[msg.id] = true;
        c = true;
    }
    // Small：始终下载清晰渐进占位（不受 autoDownload 管控）
    const small = pickSmallPhotoSize(photo);
    if (small) {
        const f = small;
        if (isFileReady(f)) {
            if (seq !== albumLoadSeq) return false;
            reconcileAlbumStore(f);
            if (!mediaCache[msg.id]) {
                thumbCache[msg.id] = convertFileSrc(f.local.path);
                thumbIsMini[msg.id] = false;
                c = true;
            }
        } else if (f.local.can_be_downloaded && !downloadingFiles.has(f.id)) {
            try {
                // 缩略图 Small：允许同步拉取（体积小，用于渐进占位）
                await safeDownloadFile(f.id, true, DL_PRIORITY.THUMBNAIL);
                const r = await tdlibSend({ _: 'getFile', file_id: f.id });
                if (seq !== albumLoadSeq) return false;
                if (isFileReady(r) && !mediaCache[msg.id]) {
                    thumbCache[msg.id] = convertFileSrc(r.local.path);
                    thumbIsMini[msg.id] = false;
                    c = true;
                }
            } catch (_) { }
        }
    }
    if (seq !== albumLoadSeq) return false;
    // Big：受「图片」自动下载管控，用于气泡/查看器正式展示
    const big = pickBigPhotoSize(photo);
    const ff = big;
    if (ff && !mediaCache[msg.id]) {
        if (isFileReady(ff)) {
            if (seq !== albumLoadSeq) return false;
            reconcileAlbumStore(ff);
            mediaCache[msg.id] = convertFileSrc(ff.local.path); c = true;
        }
        else if (ff.local.can_be_downloaded && !downloadingFiles.has(ff.id) && shouldAutoDownloadPhotos(props.chatId)) {
            // 自动下载的图片注册到下载管理器（独立隐藏分类：isAutoPhoto）
            const fileName = `photo_${msg.id || ff.id}.jpg`;
            const chatTitle = props.chatId ? (useChatStore().chats[props.chatId]?.title || `对话 #${props.chatId}`) : '';
            await downloadStore.registerDownload(ff.id, fileName, chatTitle, 0, 'photo', thumbCache[msg.id], props.chatId, msg.id, undefined, true, undefined, false, undefined, undefined, remoteIdOf(ff));
            if (seq !== albumLoadSeq) return false;
            try {
                // 正常图片 Big：异步下载，不阻塞相册加载/ UI
                await safeDownloadFile(ff.id, false, DL_PRIORITY.DEFAULT);
            } catch (_) { }
        }
    }
    return c;
}

/**
 * 判断视频是否满足自动下载条件（用于决定是否给查看器 media 项一个流式 src）：
 * 仅当自动下载总开关开启、该对话类型对应的视频开关开启，且视频体积不超过 maxSize 时，
 * 才允许自动流式加载；否则一律不自动下载，交由用户手动点击下载按钮。
 */
async function loadVideo(msg: message, seq: number): Promise<boolean> {
    if (msg.content._ !== 'messageVideo') return false;
    if (seq !== albumLoadSeq) return false;
    const downloadStore = useDownloadStore();
    let c = false;
    const v = msg.content.video;
    if (isFileReady(v.video) && !mediaCache[msg.id]) {
        if (seq !== albumLoadSeq) return false;
        reconcileAlbumStore(v.video);
        mediaCache[msg.id] = convertFileSrc(v.video.local.path); return true;
    }
    // 检查自动下载设置
    if (props.chatId && settings.autoDownload.enabled) {
        const cs = useChatStore();
        const chatData = cs.chats[props.chatId] as any;
        if (chatData) {
            const category = getChatCategory(chatData);
            const cfg = settings.autoDownload.videos;
            const shouldAuto = cfg.enabled && cfg[category];
            if (shouldAuto) {
                const sizeMB = v.video.size / (1024 * 1024);
                if (sizeMB <= cfg.maxSize && v.video.local.can_be_downloaded && !downloadingFiles.has(v.video.id)) {
                    // 自动下载的视频注册到下载管理器（正常显示，不隐藏）
                    const fileName = v.file_name || `video_${msg.id || v.video.id}.mp4`;
                    const chatTitle = props.chatId ? (useChatStore().chats[props.chatId]?.title || `对话 #${props.chatId}`) : '';
                    await downloadStore.registerDownload(v.video.id, fileName, chatTitle, v.video.size, 'video', undefined, props.chatId, msg.id, false, false, undefined, false, [DL_TAG.AUTO], undefined, remoteIdOf(v.video));
                    if (seq !== albumLoadSeq) return false;
                    try {
                        // 视频本体：异步下载，不阻塞相册；完成态由 updateFile/消息快照驱动
                        downloadingFiles.add(v.video.id);
                        await tdlibSend({
                            _: 'downloadFile',
                            file_id: v.video.id,
                            priority: DL_PRIORITY.DEFAULT,
                            offset: 0,
                            limit: 0,
                            synchronous: false,
                        });
                    } catch (_) { } finally {
                        downloadingFiles.delete(v.video.id);
                    }
                }
            }
        }
    }
    if (seq !== albumLoadSeq) return false;
    // 视频本体未就绪时：高清封面若本地可用则直接用（与图片自动下载开关无关）
    const thumb = v.thumbnail;
    const thumbFile = thumb?.file;
    if (thumbFile && isFileReady(thumbFile) && thumbFile.local.path
        && isThumbnailImgRenderable(thumb.format)) {
        if (seq !== albumLoadSeq) return false;
        thumbCache[msg.id] = convertFileSrc(thumbFile.local.path);
        thumbIsMini[msg.id] = false;
        c = true;
        return c;
    }
    // 新版顶层 cover.photo（mini → Small 同步下载，不占并发、不受 autoDownload 限制）
    const coverPhoto = msg.content._ === 'messageVideo' ? msg.content.cover : undefined;
    const coverMini = coverPhoto?.minithumbnail?.data;
    if (coverMini && !thumbCache[msg.id]) {
        thumbCache[msg.id] = `data:image/jpeg;base64,${coverMini}`;
        thumbIsMini[msg.id] = true;
        c = true;
    }
    const coverSmall = pickSmallPhotoSize(coverPhoto);
    if (coverSmall && coverSmall.local?.can_be_downloaded && !downloadingFiles.has(coverSmall.id)) {
        try {
            const r = await tdlibSend({
                _: 'downloadFile', file_id: coverSmall.id,
                priority: DL_PRIORITY.THUMBNAIL, offset: 0, limit: 0, synchronous: true,
            });
            if (seq !== albumLoadSeq) return false;
            if (isFileReady(r)) {
                thumbCache[msg.id] = convertFileSrc(r.local.path);
                thumbIsMini[msg.id] = false;
                c = true;
                return c;
            }
        } catch (_) { /* ignore */ }
    }
    // 旧字段 video.thumbnail：同步下载，不占并发
    if (thumb && isThumbnailImgRenderable(thumb.format)
        && thumbFile?.local?.can_be_downloaded && thumbFile.id && !downloadingFiles.has(thumbFile.id)) {
        try {
            const r = await tdlibSend({
                _: 'downloadFile', file_id: thumbFile.id,
                priority: DL_PRIORITY.THUMBNAIL, offset: 0, limit: 0, synchronous: true,
            });
            if (seq !== albumLoadSeq) return false;
            if (isFileReady(r)) { thumbCache[msg.id] = convertFileSrc(r.local.path); thumbIsMini[msg.id] = false; c = true; }
        } catch (_) { }
    }
    // 封面仍不可用时：mini 兜底
    if (!thumbCache[msg.id] && v.minithumbnail?.data) {
        thumbCache[msg.id] = `data:image/jpeg;base64,${v.minithumbnail.data}`;
        thumbIsMini[msg.id] = true;
        c = true;
    }
    return c;
}

/**
 * 相册内 GIF（messageAnimation）：自动下载遵循「视频」自动下载设置（分类 + maxSize）。
 * 下载成功后 mediaCache 存本地路径（用 <video> 渲染）。不满足自动下载条件时仅加载缩略图。
 */
async function loadAnimation(msg: message, seq: number): Promise<boolean> {
    if (msg.content._ !== 'messageAnimation') return false;
    if (seq !== albumLoadSeq) return false;
    const downloadStore = useDownloadStore();
    let c = false;
    const anim = msg.content.animation;
    // minithumbnail base64 已由 setAlbumPreview/rebuildLayout 注入占位
    if (isFileReady(anim.animation) && !mediaCache[msg.id]) {
        if (seq !== albumLoadSeq) return false;
        reconcileAlbumStore(anim.animation);
        mediaCache[msg.id] = convertFileSrc(anim.animation.local.path);
        return true;
    }
    // 自动下载判断：跟随视频设置
    if (props.chatId && settings.autoDownload.enabled) {
        const cs = useChatStore();
        const chatData = cs.chats[props.chatId] as any;
        if (chatData) {
            const category = getChatCategory(chatData);
            const cfg = settings.autoDownload.videos;
            if (cfg.enabled && cfg[category]) {
                const sizeMB = (anim.animation.size || 0) / (1024 * 1024);
                if (sizeMB <= cfg.maxSize && anim.animation.local.can_be_downloaded && !downloadingFiles.has(anim.animation.id)) {
                    try {
                        // GIF/动图：异步下载，不阻塞相册
                        downloadingFiles.add(anim.animation.id);
                        await tdlibSend({
                            _: 'downloadFile',
                            file_id: anim.animation.id,
                            priority: DL_PRIORITY.DEFAULT,
                            offset: 0,
                            limit: 0,
                            synchronous: false,
                        });
                    } catch (_) { } finally {
                        downloadingFiles.delete(anim.animation.id);
                    }
                }
            }
        }
    }
    if (seq !== albumLoadSeq) return false;
    // GIF 封面本地已就绪 → 直接用高清，不保留 mini
    const thumb = anim.thumbnail;
    const thumbFile = thumb?.file;
    if (thumbFile && isFileReady(thumbFile) && thumbFile.local.path
        && isThumbnailImgRenderable(thumb.format)) {
        thumbCache[msg.id] = convertFileSrc(thumbFile.local.path);
        thumbIsMini[msg.id] = false;
        c = true;
        return c;
    }
    // 不满足自动下载条件，仅加载缩略图（相册用 <img> 渲染，仅取静态位图格式）
    if (!shouldAutoDownloadPhoto()) {
        if (anim.minithumbnail?.data && !thumbCache[msg.id]) {
            thumbCache[msg.id] = `data:image/jpeg;base64,${anim.minithumbnail.data}`;
            c = true;
        }
        return c;
    }
    if (!thumb || !isThumbnailImgRenderable(thumb.format)) return false;
    if (thumbFile?.local?.can_be_downloaded && thumbFile.id && !downloadingFiles.has(thumbFile.id)) {
        const chatTitle = props.chatId ? (useChatStore().chats[props.chatId]?.title || `对话 #${props.chatId}`) : '';
        await downloadStore.registerDownload(thumbFile.id, `gif_cover_${thumbFile.id}.jpg`, chatTitle, 0, 'photo', undefined, undefined, undefined, true, false, 'video_cover', false, [DL_TAG.VIDEO_COVER, DL_TAG.THUMB], undefined, remoteIdOf(thumbFile));
    }
    if (seq !== albumLoadSeq) return false;
    if (thumbFile?.id && thumbFile.local?.can_be_downloaded) {
        try {
            const r = await tdlibSend({ _: 'downloadFile', file_id: thumbFile.id, priority: DL_PRIORITY.THUMBNAIL, offset: 0, limit: 0, synchronous: true });
            if (seq !== albumLoadSeq) return false;
            if (isFileReady(r)) { thumbCache[msg.id] = convertFileSrc(r.local.path); thumbIsMini[msg.id] = false; c = true; }
        } catch (_) { }
    }
    return c;
}

/**
 * 当前对话是否应自动下载图片（用于视频封面等辅助资源的下载遵循图片设置）。
 */
function shouldAutoDownloadPhoto(): boolean {
    return shouldAutoDownloadPhotos(props.chatId);
}

// ---- Computed display helpers ----
const lastMsg = computed(() => props.messages[props.messages.length - 1]);

// 相册描述显示规则：
// 仅当相册中【恰好一条】媒体带有非空描述时，才在相册下方显示该描述；
// 0 条或 2 条及以上媒体带描述时都不显示（否则会显得描述归属不明）。
const captionedMessages = computed(() =>
    props.messages.filter((m) => {
        const c = m.content;
        return 'caption' in c && !!c.caption?.text;
    }),
);

const captionText = computed(() => {
    if (captionedMessages.value.length !== 1) return '';
    return (captionedMessages.value[0].content as any).caption?.text || '';
});

const captionFormatted = computed(() => {
    if (captionedMessages.value.length !== 1) return { _: 'formattedText' as const, text: '', entities: [] };
    return (captionedMessages.value[0].content as any).caption || { _: 'formattedText' as const, text: '', entities: [] };
});

const borderRadiusClass = computed(() => {
    // 无可见 caption：相册在气泡外，四角圆角
    if (!captionText.value) return 'rounded-lg';
    if (props.isSelf) return 'rounded-lg rounded-tr-none';
    return 'rounded-lg rounded-tl-none';
});

const lastDate = computed(() => lastMsg.value?.date || 0);
const lastSendingState = computed(() => lastMsg.value?.sending_state);
const lastViewCount = computed(() => lastMsg.value?.interaction_info?.view_count);

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}
</script>
