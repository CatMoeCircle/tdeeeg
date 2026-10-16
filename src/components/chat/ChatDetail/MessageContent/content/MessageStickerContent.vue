<template>
    <div ref="rootEl" :class="content._ === 'messageAnimatedEmoji' ? 'w-24 h-24 cursor-pointer' : ''"
        :style="content._ !== 'messageAnimatedEmoji' ? stickerSizeStyle : undefined" @click="onContentClick">
        <!-- WEBP static sticker -->
        <img v-if="format === 'webp' && mediaSrc" :src="mediaSrc" class="w-full h-full object-contain" />
        <!-- TGS animated sticker (tlottie) -->
        <TgsPlayer v-else-if="format === 'tgs' && tgsSrc" ref="playerRef" :src="tgsSrc" :loop="!isAnimatedEmoji"
            :autoplay="true" :size="tgsSize" :fitz-modifier="fitzModifier" @load="onAnimLoad" @error="onAnimError" />
        <!-- WEBM video sticker -->
        <video v-else-if="format === 'webm' && mediaSrc" ref="videoRef" :src="mediaSrc" autoplay loop muted playsinline
            class="w-full h-full object-contain" />
        <!-- Thumbnail placeholder (sticker's own thumbnail) -->
        <img v-else-if="thumbSrc" :src="thumbSrc" class="w-full h-full object-contain" />
        <!-- Fallback: gray background -->
        <div v-else class="w-full h-full sticker-placeholder" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import type { messageAnimatedEmoji, messageSticker } from 'tdlib-types';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../../utils/tdlib';
import { useDownloadStore, remoteIdOf, hasTdlibUpdate } from '../../../../../store/downloads';
import { settings } from '../../../../../store/settings';
import { openStickerSetDialog } from '../../../../../store/stickerSetDialog';
import { useLottiePause } from '../../../../../composables/useLottiePause';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import type { ViewportLoadScope } from '../../../../../utils/viewportLoadGate';
import { convertFileSrc } from "@tauri-apps/api/core";
import TgsPlayer, { type TgsPlayerInstance } from '../../../../common/TgsPlayer.vue';
import { telegramFitzToFitzModifier } from '../../../../../utils/tlottieFitz';

const props = withDefaults(defineProps<{
    content: messageSticker | messageAnimatedEmoji;
    size?: number;
    /** 视口加载所用的队列池（详情弹窗传 stickerDetail，便于限流并在关闭时清队） */
    loadScope?: ViewportLoadScope;
}>(), { loadScope: 'chat' });

const rootEl = ref<HTMLElement | null>(null);
const playerRef = ref<TgsPlayerInstance | null>(null);
/** WEBM/GIF 视频元素（受同一窗口/视口暂停门控） */
const videoRef = ref<HTMLVideoElement | null>(null);
const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);
/** 加载代次：content 变化时自增，丢弃过期下载结果，避免旧贴纸窜到新内容 */
let loadSeq = 0;
/** TGS 本地文件 URL（convertFileSrc → tlottie fetch） */
const tgsSrc = ref<string | null>(null);
/** Telegram fitzpatrick → tlottie FitzModifier */
const fitzModifier = computed(() => {
    const fitzType = props.content._ === 'messageAnimatedEmoji'
        ? (props.content.animated_emoji.fitzpatrick_type || 0)
        : 0;
    return telegramFitzToFitzModifier(fitzType);
});

/** 是否为"大号动画表情"（messageAnimatedEmoji：只播一次、点击重播） */
const isAnimatedEmoji = computed(() => props.content._ === 'messageAnimatedEmoji');

/** 统一的 Lottie 暂停/恢复控制器：视口离开、窗口失焦、平滑滚动时暂停 */
const { register: registerAnim, registerVideo, get: getAnim, setup: setupPause } = useLottiePause(rootEl);

/** TGS 显示边长（动画表情固定方形；普通贴纸跟随设置） */
const tgsSize = computed(() => isAnimatedEmoji.value ? 96 : (props.size ?? settings.sticker.size));

/** 贴纸尺寸样式（跟随设置，仅对普通贴纸生效；动画表情保持固定） */
const stickerSizeStyle = computed<Record<string, string>>(() => ({
    width: `${props.size ?? settings.sticker.size}px`,
    height: `${props.size ?? settings.sticker.size}px`,
}));

const sticker = computed(() => props.content._ === 'messageSticker'
    ? props.content.sticker
    : props.content.animated_emoji.sticker);

/** 贴纸自带缩略图（已下载时可直接显示，作为加载前的占位） */
const thumbSrc = computed(() => {
    const s = sticker.value;
    if (!s?.thumbnail?.file) return undefined;
    const f = s.thumbnail.file;
    if (f.local.is_downloading_completed && f.local.path) {
        return convertFileSrc(f.local.path);
    }
    return undefined;
});

/** 检测贴纸格式 */
const format = computed(() => sticker.value?.format._ === 'stickerFormatTgs' ? 'tgs'
    : sticker.value?.format._ === 'stickerFormatWebm' ? 'webm'
        : 'webp');

const getFile = () => sticker.value?.sticker;

const loadMedia = async () => {
    const f = getFile();
    if (!f) return;
    const seq = loadSeq;

    if (isFileReady(f)) {
        if (seq !== loadSeq) return;
        await loadSticker(f.local.path, seq);
    } else if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
        await downloadFile(f.id, seq);
    }
};

const downloadFile = async (fileId: number, seq: number) => {
    if (isDownloading.value) return;
    if (downloadingFiles.has(fileId)) return;
    isDownloading.value = true;
    downloadingFiles.add(fileId);
    const ext = format.value === 'tgs' ? 'tgs' : format.value === 'webm' ? 'webm' : 'webp';
    const st = sticker.value;
    const stFile = st?.sticker;
    const setLabel = st?.set_id ? `贴纸集 #${st.set_id}` : undefined;
    await useDownloadStore().registerDownload(
        fileId, `sticker_${fileId}.${ext}`, setLabel || '', 0, 'sticker',
        undefined, undefined, undefined, true, false, 'sticker', false,
        undefined, setLabel, remoteIdOf(stFile),
    );
    try {
        const res = await tdlibSend({
            _: "downloadFile",
            file_id: fileId,
            priority: DL_PRIORITY.DEFAULT,
            offset: 0,
            limit: 0,
            synchronous: true,
        });
        if (seq !== loadSeq) return;
        if (isFileReady(res)) {
            await loadSticker(res.local.path, seq);
        }
    } catch (e) {
        console.error("Sticker download failed", e);
    } finally {
        downloadingFiles.delete(fileId);
        if (seq === loadSeq) isDownloading.value = false;
    }
};

/** 加载贴纸（根据格式选择渲染方式）；seq 用于丢弃内容已替换后的过期写回 */
async function loadSticker(filePath: string, seq = loadSeq) {
    if (seq !== loadSeq) return;
    if (format.value === 'webp') {
        mediaSrc.value = convertFileSrc(filePath);
    } else if (format.value === 'tgs') {
        loadTgs(filePath, seq);
    } else if (format.value === 'webm') {
        mediaSrc.value = convertFileSrc(filePath);
    }
}

/** 加载 TGS：本地路径 → asset URL，tlottie 以 src fetch + Worker 内解压 */
function loadTgs(filePath: string, seq = loadSeq) {
    tgsSrc.value = null;
    requestAnimationFrame(() => {
        if (seq !== loadSeq) return;
        tgsSrc.value = convertFileSrc(filePath);
    });
}

function onAnimError(e: unknown) {
    console.error('[MessageStickerContent] TGS error', e, tgsSrc.value);
}

/** TgsPlayer 加载完成回调：把实例注册进暂停/恢复控制器 */
function onAnimLoad() {
    registerAnim(playerRef.value);
}

// WEBM/GIF 视频：等 DOM 渲染出 <video> 后注册进窗口/视口暂停门控
watch([format, mediaSrc, () => props.content], () => {
    registerVideo(format.value === 'webm' && mediaSrc.value ? videoRef.value : null);
}, { flush: 'post' });

/**
 * 点击行为：
 * - 普通贴纸：打开所属贴纸包信息弹窗
 * - 大号 emoji（messageAnimatedEmoji，含标准 emoji）：从头重播并打开所属表情包弹窗
 */
function onContentClick() {
    const s = sticker.value;
    if (props.content._ === 'messageSticker') {
        openStickerSetDialog(s?.set_id);
        return;
    }
    if (!isAnimatedEmoji.value) return;
    const anim = getAnim();
    // 若因窗口失焦/离开视口被暂停，重播不受影响
    if (anim) {
        anim.stop?.();
        anim.play();
    }
    openStickerSetDialog(s?.set_id);
}

// 挂载后初始化暂停控制器（视口观察 + 窗口聚焦 + 平滑滚动监听）
onMounted(() => {
    setupPause();
});

/**
 * 丢弃排队加载时清理下载列表：
 * 只处理「已登记但尚未真正开下」的条目——从列表移除（only_if_pending 取消）。
 * 已开始下载的（收到过 update / 有进度 / 在 TDLib 下载列表）不取消、不干预。
 */
async function dropQueuedDownloadRow() {
    const f = getFile();
    if (!f) return;
    // 该文件本次会话正在下载（别处已发起）：不干预
    if (downloadingFiles.has(f.id)) return;
    const store = useDownloadStore();
    const info = store.getDownloadInfoForFile(f);
    if (!info || info.is_completed) return;
    if (hasTdlibUpdate(info) || info.in_tdlib_list) return;
    await store.cancelDownload(info.remote_id || info.session_file_id || info.file_id);
}

// 视口门控：进入视口才下载真实贴纸文件；未进入显示 emoji 占位。
// 详情弹窗（stickerDetail）下额外：离开视口即丢弃尚未开始下载的排队任务，
// 并清掉它的下载列表条目；聊天页保持原语义（排过队就下完）。
const { start: startViewportLoad, entered: stickerEntered, requeue: requeueLoad } = useViewportLoad(rootEl, () => {
    return loadMedia();
}, {
    scope: props.loadScope,
    onDrop: props.loadScope === 'stickerDetail'
        ? () => { void dropQueuedDownloadRow(); }
        : undefined,
});

/** 贴纸身份：TDLib 会以新对象引用反复推送同一消息（回执/编辑/更新），身份未变时不能重置播放器 */
function stickerIdentity(c: messageSticker | messageAnimatedEmoji): string {
    const s = c._ === 'messageSticker' ? c.sticker : c.animated_emoji.sticker;
    return `${c._}:${s?.sticker?.id ?? 0}:${s?.format._ ?? ''}`;
}
let contentKey: string | null = null;

watch(() => props.content, (content) => {
    const key = stickerIdentity(content);
    if (key === contentKey) {
        // 同一贴纸只是消息对象换了引用：不作废在途加载、不销毁重建播放器，
        // 防止同样的贴纸被反复重新渲染（每次重建 = Worker 重新解析 + 重画）。
        // 仅在还没加载出画面时补一次（如文件刚就绪但没触发过加载），
        // 且补加载重新排队而不直连，保证详情页 1 并发串行。
        if (stickerEntered.value && !tgsSrc.value && !mediaSrc.value) requeueLoad();
        return;
    }
    contentKey = key;
    // 换内容：作废在途加载并复位 isDownloading，否则新贴纸被旧下载状态挡住
    loadSeq++;
    isDownloading.value = false;
    mediaSrc.value = undefined;
    tgsSrc.value = null;
    registerAnim(null);
    // 已进入视口（此前无内容/已触发过）时新内容到达需补下载。
    // 这里用直连（内容被替换属罕见路径，且旧任务已被 loadSeq 作废）。
    if (stickerEntered.value) loadMedia();
}, { immediate: true });
onMounted(() => {
    startViewportLoad();
});
</script>

<style scoped>
.sticker-placeholder {
    background: rgba(128, 128, 128, 0.12);
    border-radius: 8px;
}
</style>
