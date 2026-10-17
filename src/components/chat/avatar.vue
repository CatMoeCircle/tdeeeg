<template>
    <div ref="rootEl" :class="containerClass" :style="containerStyle">
        <!-- 已删除账户：不显示照片/首字母，改用 tgico 图标 + 归档灰色渐变 -->
        <div v-if="deletedAccount" class="w-full h-full flex items-center justify-center text-white select-none"
            :style="{ background: deletedBackground }">
            <span class="tgico tgico-avatar-deletedaccount" :style="{ fontSize: iconSize }"></span>
        </div>
        <img v-else-if="avatar" :src="avatar" alt="avatar" class="w-full h-full object-cover"
            @error="onImgError" />
        <div v-else class="w-full h-full flex items-center justify-center select-none"
            :class="initialsTextClass" :style="initialsTextStyle">{{ initials }}</div>
    </div>
</template>

<script lang="ts">
/**
 * 模块级共享的 ResizeObserver：所有 Avatar 实例共用一个，按元素分发回调。
 * 每实例各 new 一个会随头像数量线性增长；无注册者时 disconnect，下次注册再创建。
 */
const resizeCbs = new Map<Element, () => void>();
let sharedResizeObserver: ResizeObserver | null = null;

function observeAvatarResize(el: Element, cb: () => void) {
    resizeCbs.set(el, cb);
    if (!sharedResizeObserver) {
        sharedResizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) resizeCbs.get(entry.target)?.();
        });
    }
    sharedResizeObserver.observe(el);
}

function unobserveAvatarResize(el: Element) {
    resizeCbs.delete(el);
    sharedResizeObserver?.unobserve(el);
    if (resizeCbs.size === 0) {
        sharedResizeObserver?.disconnect();
        sharedResizeObserver = null;
    }
}
</script>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onUnmounted } from 'vue';
import type { chatPhotoInfo, profilePhoto } from "tdlib-types";
import { avatarUrlOf, requestAvatar } from '../../utils/avatarLoader';
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
    /** 用户名（无头像时与 lastName 组合成首字母文本；仅传其一则显示该名前 2 位） */
    firstName?: string;
    lastName?: string;
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

/** 文字头像字号约为头像尺寸的 38%（略小于常见 0.4，避免小头像字母偏大） */
const INITIALS_RATIO = 0.38;

/** 组件根元素：用于测量实际渲染尺寸（消息列表头像未传 sizeClass 时仍能正确缩放图标） */
const rootEl = ref<HTMLElement | null>(null);
/** 实测到的头像容器像素尺寸（宽高取较小者，按正方形处理） */
const measuredPx = ref<number | null>(null);
let observedEl: HTMLElement | null = null;

onMounted(() => {
    const el = rootEl.value;
    if (!el) return;
    observedEl = el;
    observeAvatarResize(el, () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        measuredPx.value = Math.min(w, h);
    });
});

onUnmounted(() => {
    if (observedEl) unobserveAvatarResize(observedEl);
    observedEl = null;
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

/**
 * 无头像时的文字：
 * - 传了姓名（用户头像）：first_name 首位 + last_name 首位；只有一侧有值时取该名前 2 位；
 * - 未传姓名（群组/频道等）：回退到 title 前 2 个字符。
 */
const initials = computed(() => {
    const first = (props.firstName || '').trim();
    const last = (props.lastName || '').trim();
    if (first && last) return first.charAt(0) + last.charAt(0);
    const single = first || last;
    if (single) return single.substring(0, 2);
    return (props.title || '').substring(0, 2);
});

/** 文字头像字号：按容器实测尺寸缩放，避免固定 text-xs 在小头像上显得偏大 */
const initialsFontSize = computed(() => {
    if (measuredPx.value && measuredPx.value > 0) {
        return `${Math.round(measuredPx.value * INITIALS_RATIO)}px`;
    }
    const px = /(\d+)x?/.exec(props.sizeClass || '');
    const size = px ? parseInt(px[1], 10) : 54;
    return `${Math.round(size * INITIALS_RATIO)}px`;
});

/** 无头像时：有效（≥0）的 accentColorId 用其主题渐变背景 + 白色文字；否则（未传或 TDLib 的 -1）按标题哈希回退到内置渐变色，避免千篇一律的灰底/蓝底 */
const initialsTextStyle = computed(() => {
    const id = typeof props.accentColorId === 'number' && props.accentColorId >= 0
        ? props.accentColorId
        : hashAccentId();
    return {
        background: accentAvatarBackground(id),
        fontSize: initialsFontSize.value,
    };
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


/** 加载失败的图片地址（响应式）：失败后该地址不再渲染，回退到下一个候选或首字母 */
const brokenSrcs = reactive(new Set<string>());

/**
 * 当前展示的头像（纯派生，不在组件内下载）：
 * 1. 共享缓存里的真实头像（同一文件所有实例同时切换）；
 * 2. 否则 base64 缩略图占位；
 * 3. 都没有则返回 undefined，显示颜色 + 首字母。
 */
const avatar = computed<string | undefined>(() => {
    const real = avatarUrlOf(props.photo?.small);
    if (real && !brokenSrcs.has(real)) return real;
    const mini = props.photo?.minithumbnail;
    const preview = mini ? 'data:image/jpeg;base64,' + mini.data : undefined;
    return preview && !brokenSrcs.has(preview) ? preview : undefined;
});

function onImgError() {
    if (avatar.value) brokenSrcs.add(avatar.value);
}

/** 进入视口后请求头像（共享去重 + 全局并发闸门；同文件多次调用只会下载一次） */
function ensureAvatar() {
    if (props.photo?.small) requestAvatar(props.photo.small, props.title || '');
}

// 视口门控：仅可见的头像才请求下载；快速划过不触发（停留防抖在 useViewportLoad 内）
const { start: startViewportLoad, entered } = useViewportLoad(rootEl, ensureAvatar, { enqueue: false });

// 换了新头像文件（small.id 变化）时：已在视口内则立即请求新文件
watch(
    () => props.photo?.small?.id,
    () => {
        if (entered.value) ensureAvatar();
    }
);
onMounted(() => {
    startViewportLoad();
});

</script>