<template>
    <div ref="rootEl" :class="containerClass" :style="containerStyle">
        <!-- 已删除账户：不显示照片/首字母，改用 tgico 图标 + 归档灰色渐变 -->
        <div v-if="deletedAccount" class="w-full h-full flex items-center justify-center text-white select-none"
            :style="{ background: deletedBackground }">
            <span class="tgico tgico-avatar-deletedaccount" :style="{ fontSize: iconSize }"></span>
        </div>
        <img v-else-if="avatar && !imgError" :src="avatar" alt="avatar" class="w-full h-full object-cover"
            @error="onImgError" />
        <div v-else class="w-full h-full flex items-center justify-center text-xs select-none"
            :class="initialsTextClass" :style="initialsStyle">{{ initials }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import type { chatPhotoInfo, profilePhoto } from "tdlib-types";
import { tdlibSend, isFileReady, downloadingFiles } from '../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { DL_PRIORITY } from '../../utils/downloadPriority';
import { useDownloadStore } from '../../store/downloads';
import { useColors } from '../../store/colors';
import { useViewportLoad } from '../../composables/useViewportLoad';

const props = defineProps<{
    photo?: chatPhotoInfo | profilePhoto;
    title?: string;
    sizeClass?: string;
    /** 是否使用方形圆角（用于话题群组头像），radius 提供时优先使用 radius */
    square?: boolean;
    /** 圆角角度 0~100（0=方形，100=圆形），话题群组统一使用 */
    radius?: number;
    /** 无头像时的名称头像主题色 id（Telegram accent_color_id） */
    accentColorId?: number;
    /** 是否已删除账户：显示 tgico 删除图标 + 归档灰色渐变背景 */
    deletedAccount?: boolean;
    /** 去除容器占位背景色（bg-gray-300），用于需要透明背景的场景（如个人资料页大头像） */
    noBackground?: boolean;
}>();

const { accentAvatarBackground } = useColors();

/** 已删除账户的归档灰色渐变（Web K: --peer-avatar-archive-top/bottom） */
const deletedBackground = 'linear-gradient(#B8C2CC, #9EAAB5)';

/** 已删除账户图标尺寸约为头像尺寸的 60% */
const GHOST_ICON_RATIO = 0.6;

/** 组件根元素：用于测量实际渲染尺寸（消息列表头像未传 sizeClass 时仍能正确缩放图标） */
const rootEl = ref<HTMLElement | null>(null);
/** 实测到的头像容器像素尺寸（宽高取较小者，按正方形处理） */
const measuredPx = ref<number | null>(null);
let avatarResizeObserver: ResizeObserver | null = null;

onMounted(() => {
    const el = rootEl.value;
    if (!el) return;
    avatarResizeObserver = new ResizeObserver(() => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        measuredPx.value = Math.min(w, h);
    });
    avatarResizeObserver.observe(el);
});

onUnmounted(() => {
    if (avatarResizeObserver) {
        avatarResizeObserver.disconnect();
        avatarResizeObserver = null;
    }
});

/** 图标尺寸：优先用实测容器尺寸；否则回退到 sizeClass 解析；再回退到 54px */
const iconSize = computed(() => {
    if (measuredPx.value && measuredPx.value > 0) {
        return `${Math.round(measuredPx.value * GHOST_ICON_RATIO)}px`;
    }
    const px = /(\d+)x?/.exec(props.sizeClass || '');
    const size = px ? parseInt(px[1], 10) : 54;
    return `${Math.round(size * GHOST_ICON_RATIO)}px`;
});

const imgError = ref(false);

const initials = computed(() => {
    const t = props.title || '';
    return t.substring(0, 2);
});

/** 无头像时：有 accentColorId 用其主题渐变背景 + 白色文字；否则按标题哈希回退到内置渐变色，避免千篇一律的灰底 */
const initialsStyle = computed(() => {
    const id = typeof props.accentColorId === 'number' ? props.accentColorId : hashAccentId();
    return { background: accentAvatarBackground(id) };
});

const initialsTextClass = computed(() => 'text-white');

/** 标题哈希 → 0~6，用于无 accent 数据时仍能显示不同的内置渐变色 */
function hashAccentId(): number {
    const t = props.title || '';
    let h = 0;
    for (let i = 0; i < t.length; i++) {
        h = (h * 31 + t.charCodeAt(i)) >>> 0;
    }
    return h % 7;
}

/** 圆角百分比：radius 0~100 → 0%~50%（0=方形，100=圆形） */
const radiusPct = computed(() => {
    if (typeof props.radius === 'number') {
        return props.radius * 0.5;
    }
    if (props.square) return 0;
    return 50;
});

const containerStyle = computed(() => ({ borderRadius: `${radiusPct.value}%` }));

const containerClass = computed(() => {
    const bg = props.noBackground ? '' : ' bg-gray-300';
    const base = `w-full h-full ${bg} shrink-0 overflow-hidden`;
    if (props.sizeClass) return ` ${props.sizeClass} ${base}`;
    return base;
});


/** base64 缩略图预览（data URL），下载前/下载失败时兜底显示 */
const previewDataUrl = ref<string | undefined>(undefined);
/** 已下载的真实头像 URL（convertFileSrc 后的 asset URL） */
const downloadedUrl = ref<string | undefined>(undefined);

/**
 * 当前展示的头像 URL：
 * - 优先用已下载的真实头像；
 * - 未下载完成或下载后的图片加载失败时，回退到 base64 缩略图预览；
 * - 两者都没有（确无头像）才显示颜色 + 文本。
 */
const avatar = computed<string | undefined>(() => downloadedUrl.value ?? previewDataUrl.value);

/** 记录下载后的真实头像是否加载失败，失败则回退到预览图 */
function onDownloadedError() {
    if (downloadedUrl.value) {
        downloadedUrl.value = undefined;
    }
}

function onImgError() {
    if (downloadedUrl.value) {
        onDownloadedError();
    } else {
        imgError.value = true;
    }
}

function resetFromPhoto(photo: chatPhotoInfo | profilePhoto | undefined) {
    imgError.value = false;
    // 先重置已下载 URL，避免旧文件在新缩略图之上残留
    downloadedUrl.value = undefined;
    if (!photo) {
        previewDataUrl.value = undefined;
        return;
    }
    // 有 base64 缩略图就先展示预览（首次打开也能立即看到头像，而非颜色+文本）
    previewDataUrl.value = photo.minithumbnail
        ? `data:image/jpeg;base64,${photo.minithumbnail.data}`
        : undefined;
    if (isFileReady(photo.small)) {
        downloadedUrl.value = convertFileSrc(photo.small.local.path);
    }
}

/** 当前要下载的头像照片（供视口进入时懒下载） */
let pendingPhoto: chatPhotoInfo | profilePhoto | undefined = undefined;

/**
 * 真正触发头像文件下载（进入视口后由 useViewportLoad 调用一次）。
 * 未进入视口前只展示 base64 预览，不下载真实头像。
 */
async function downloadCurrentPhoto(photo: chatPhotoInfo | profilePhoto) {
    const f = photo.small;
    if (!f?.id) return;
    if (isFileReady(f) || downloadingFiles.has(f.id)) return;
    downloadingFiles.add(f.id);
    // 头像：记录为隐藏资源，不需要来源（chat_id/message_id 留空），分类为 avatar
    const fileName = `${props.title || '头像'}_${f.id}.jpg`;
    try {
        await useDownloadStore().registerDownload(f.id, fileName, '', 0, 'avatar', undefined, undefined, undefined, true, false, 'avatar');
        const file = await tdlibSend({
            _: "downloadFile",
            file_id: f.id,
            priority: DL_PRIORITY.THUMBNAIL,
            offset: 0,
            limit: 0,
            synchronous: true,
        });
        // 下载期间 photo 可能已切换，仅当仍指向同一文件时才替换
        if (file.local?.path && pendingPhoto?.small?.id === f.id) {
            downloadedUrl.value = convertFileSrc(file.local.path);
        }
    } finally {
        downloadingFiles.delete(f.id);
    }
}

// 视口门控：头像进入视口才下载真实文件；未进入只显示 base64 预览。
// 注意：必须在 watch 之前声明（immediate watch 会同步执行并读取 entered）。
const { start: startViewportLoad, entered } = useViewportLoad(
    rootEl,
    () => {
        const photo = pendingPhoto;
        if (photo && !isFileReady(photo.small)) void downloadCurrentPhoto(photo);
    }
);

watch(
    () => props.photo,
    (photo) => {
        pendingPhoto = photo;
        resetFromPhoto(photo);
        // 若头像已进入视口（此前无头像/已就绪未触发），新头像到达后应懒加载真实文件
        if (entered.value && photo && !isFileReady(photo.small)) {
            void downloadCurrentPhoto(photo);
        }
    },
    { immediate: true }
);
onMounted(() => {
    startViewportLoad();
});

</script>