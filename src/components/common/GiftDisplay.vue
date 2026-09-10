<template>
    <!-- 升级礼物（NFT礼物）卡片 -->
    <div v-if="isUpgraded" class="gift-grid-item" :style="{ width: sizePx, height: gridHeightPx }">
        <!-- 径向渐变背景层 -->
        <div class="gift-backdrop" :style="backdropStyle">
            <!-- 光晕（Web 版 _halo: 200×200 radial-gradient center→edge 50%） -->
            <div v-if="backdropColors" class="gift-halo" :style="haloStyle" />
        </div>
        <!-- 背景图案（Symbol.Sticker，半透明、绕中心向四周扩散） -->
        <div v-if="symbolStickerMsg" class="gift-pattern">
            <div v-for="(item, i) in patternItems" :key="i" class="pattern-cell" :style="item.style">
                <MessageStickerContent :content="symbolStickerMsg" :size="item.size" />
            </div>
        </div>
        <!-- 置顶图标（与普通礼物发送人头像同位置同大小） -->
        <div v-if="isPinned" class="gift-from">
            <div class="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-black/20">
                <span class="tgico tgico-pin text-white rotate-45" style="font-size:12px"></span>
            </div>
        </div>
        <!-- NFT 礼物主体（Model.Sticker，小一号居中） -->
        <div class="gift-sticker" :style="{ width: nftModelPx, height: nftModelPx }">
            <MessageStickerContent v-if="modelSticker" :content="modelStickerMsg" :size="nftModelSize" />
            <Gift v-else class="w-full h-full text-gray-400" />
        </div>
        <!-- 右上角对角丝带 -->
        <div v-if="badgeText" class="gift-badge" :style="badgeStyle">
            <span class="gift-badge-text">{{ badgeText }}</span>
        </div>
    </div>

    <!-- 普通礼物卡片 -->
    <div v-else class="gift-grid-item gift-regular" :style="{ width: sizePx, height: gridHeightPx }">
        <!-- 礼物贴纸（flex flow） -->
        <div class="gift-sticker" :style="{ width: modelPx, height: modelPx }">
            <MessageStickerContent v-if="regularSticker" :content="regularStickerMsg" :size="modelSize" />
            <Gift v-else class="w-full h-full text-gray-400" />
        </div>
        <!-- 发送人头像（非私密礼物，左上角 24×24 容器，20×20 头像） -->
        <div v-if="showSenderAvatar && senderAvatarUrl" class="gift-from">
            <div class="w-5 h-5 rounded-full overflow-hidden">
                <img :src="senderAvatarUrl" class="w-full h-full object-cover" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Gift } from 'lucide-vue-next';
import type {
    receivedGift,
    sentGiftRegular,
    sentGiftUpgraded,
    upgradedGift,
    sticker,
    user,
    chat,
    chatPhotoInfo,
} from 'tdlib-types';
import { tdlibSend } from '../../utils/tdlib';
import { convertFileSrc } from '@tauri-apps/api/core';
import MessageStickerContent from '../chat/ChatDetail/MessageContent/content/MessageStickerContent.vue';
import { intToRgb, rgbToCss } from '../../store/colors';

const props = withDefaults(defineProps<{
    gift: receivedGift;
    size?: number;
    showSenderAvatar?: boolean;
}>(), {
    size: 112,
    showSenderAvatar: false,
});

const sizePx = computed(() => `${props.size}px`);
// 卡片为正方形边框（宽高相等）
const gridHeightPx = computed(() => `${props.size}px`);
const modelSize = computed(() => Math.floor(props.size * 0.55));
const modelPx = computed(() => `${modelSize.value}px`);
// NFT 礼物主体“小一号”，为四周环绕的符号图案留出空间
const nftModelSize = computed(() => Math.floor(props.size * 0.55));
const nftModelPx = computed(() => `${nftModelSize.value}px`);

// ---------- 类型判断 ----------
const sentGift = computed(() => props.gift.gift as any);
const isUpgraded = computed(() => sentGift.value?._ === 'sentGiftUpgraded');

// ---------- 升级礼物数据 ----------
const upgradedData = computed<upgradedGift | null>(() => {
    if (!isUpgraded.value) return null;
    return (props.gift.gift as sentGiftUpgraded).gift;
});

// ---------- 模型贴纸（礼物主体）----------
const modelSticker = computed<sticker | null>(() => {
    if (isUpgraded.value) return upgradedData.value?.model?.sticker ?? null;
    const sent = props.gift.gift as sentGiftRegular;
    return sent?.gift?.sticker ?? null;
});

const modelStickerMsg = computed(() => ({
    _: 'messageSticker' as const,
    sticker: modelSticker.value!,
    is_premium: false,
}));

// ---------- 普通礼物贴纸 ----------
const regularSticker = computed<sticker | null>(() => {
    if (isUpgraded.value) return null;
    const sent = props.gift.gift as sentGiftRegular;
    return sent?.gift?.sticker ?? null;
});

const regularStickerMsg = computed(() => ({
    _: 'messageSticker' as const,
    sticker: regularSticker.value!,
    is_premium: false,
}));

// ---------- 符号贴纸（背景图案） ----------
const symbolSticker = computed(() => upgradedData.value?.symbol?.sticker ?? null);

const symbolStickerMsg = computed(() => {
    if (!symbolSticker.value) return null;
    return {
        _: 'messageSticker' as const,
        sticker: symbolSticker.value,
        is_premium: false,
    };
});

// 背景图案：把卡片当作网格「画布」，图案按棋盘格交错排列。
// 同一行「放一个、空一个」，下一行整体错位一格，填到上一行空位的正下方，形成均匀的错位网格；
// 图案较小、较密集地铺满卡片，超出卡片边界的部分被裁剪隐藏，越靠边越透明。
const patternItems = computed(() => {
    const size = props.size;
    const half = size / 2;
    const cell = size * 0.20;                 // 网格单元尺寸（相邻图案的间距，更紧密）
    const symbol = Math.floor(size * 0.16);   // 单个符号贴纸渲染尺寸（更小）
    const extent = 3;                         // 每个方向的格子数（-extent..extent，约 24 个图案）
    const items: { size: number; style: Record<string, string> }[] = [];
    for (let row = -extent; row <= extent; row++) {
        for (let col = -extent; col <= extent; col++) {
            // 棋盘交错：只保留 row+col 为偶数的格子（放一个空一个，下一行错位）
            if (((row + col) & 1) !== 0) continue;
            const x = col * cell;
            const y = row * cell;
            const dist = Math.hypot(x, y);
            // 跳过正中心（留给 Model.Sticker 主体）
            if (dist < 1) continue;
            // 越靠边越透明：中心附近较浓，卡片边缘（≈half）衰减到 ~0.1，远处趋近 0.05
            const opacity = Math.max(0.05, 1 - (dist / half) * 0.9);
            items.push({
                size: symbol,
                style: {
                    width: `${symbol}px`,
                    height: `${symbol}px`,
                    left: `${half + x - symbol / 2}px`,
                    top: `${half + y - symbol / 2}px`,
                    opacity: opacity.toFixed(2),
                } as Record<string, string>,
            });
        }
    }
    return items;
});

// ---------- 背景颜色 ----------
const backdropColors = computed(() => {
    const c = upgradedData.value?.backdrop?.colors;
    if (!c) return null;
    return {
        center: intToRgb(c.center_color),
        edge: intToRgb(c.edge_color),
        symbol: intToRgb(c.symbol_color),
        text: intToRgb(c.text_color),
    };
});

// 背景层：使用 edge 颜色作为底色（Web 版 _itemBackdrop）
const backdropStyle = computed(() => {
    if (!backdropColors.value) return {};
    return {
        background: rgbToCss(backdropColors.value.edge),
    };
});

// 光晕：radial-gradient(centerColor 0%, edgeColor 50%)，200×200 居中
const haloStyle = computed(() => {
    if (!backdropColors.value) return {};
    const c = backdropColors.value.center;
    const e = backdropColors.value.edge;
    return {
        background: `radial-gradient(rgb(${c.join(',')}) 0%, rgb(${e.join(',')}) 50%)`,
    };
});

// ---------- 置顶状态 ----------
const isPinned = computed(() => props.gift.is_pinned);

// ---------- 角标丝带（右上角横幅，始终显示编号） ----------
const badgeText = computed(() => {
    const g = upgradedData.value;
    if (!g) return '';
    if (g.max_upgraded_count > 0) {
        return `#${g.number}`;
    }
    return '';
});

const badgeStyle = computed(() => {
    // 丝带随卡片缩放：以 112px 尺寸为基准 58×58，小卡片等比缩小
    const s = Math.max(0.45, props.size / 112);
    const style: Record<string, string> = {
        transform: `scale(${s})`,
        transformOrigin: 'top right',
        background: 'linear-gradient(#8AD3F9, #519DEA)',
    };
    if (backdropColors.value) {
        const c = backdropColors.value.center;
        const e = backdropColors.value.edge;
        style.background = `linear-gradient(rgb(${c.join(',')}), rgb(${e.join(',')}))`;
    }
    return style;
});

// ---------- 发送人头像（普通非私密礼物） ----------
const senderAvatarUrl = ref<string | undefined>(undefined);

watch(() => props.showSenderAvatar, async (show) => {
    if (!show || isUpgraded.value || props.gift.is_private) {
        senderAvatarUrl.value = undefined;
        return;
    }
    const sender = props.gift.sender_id;
    if (!sender) { senderAvatarUrl.value = undefined; return; }
    try {
        if (sender._ === 'messageSenderUser') {
            const u = await tdlibSend({ _: 'getUser', user_id: sender.user_id }) as user;
            const photo = u.profile_photo;
            if (photo) {
                const file = photo.small;
                if (file?.local?.is_downloading_completed) {
                    senderAvatarUrl.value = convertFileSrc(file.local.path);
                } else if (file?.id) {
                    const res = await tdlibSend({
                        _: 'downloadFile',
                        file_id: file.id,
                        priority: 16,
                        offset: 0,
                        limit: 0,
                        synchronous: true,
                    }) as any;
                    if (res?.local?.is_downloading_completed) {
                        senderAvatarUrl.value = convertFileSrc(res.local.path);
                    }
                }
            }
        } else if (sender._ === 'messageSenderChat') {
            const c = await tdlibSend({ _: 'getChat', chat_id: sender.chat_id }) as chat;
            const photo = c.photo as chatPhotoInfo | undefined;
            if (photo?.small?.local?.is_downloading_completed) {
                senderAvatarUrl.value = convertFileSrc(photo.small.local.path);
            } else if (photo?.small?.id) {
                const res = await tdlibSend({
                    _: 'downloadFile',
                    file_id: photo.small.id,
                    priority: 16,
                    offset: 0,
                    limit: 0,
                    synchronous: true,
                }) as any;
                if (res?.local?.is_downloading_completed) {
                    senderAvatarUrl.value = convertFileSrc(res.local.path);
                }
            }
        }
    } catch { /* ignore */ }
}, { immediate: true });
</script>

<style scoped>
/* 网格单元格（参考 Web 版 _gridItem: display:flex, border-radius:10px, overflow:visible） */
.gift-grid-item {
    border-radius: 10px;
    overflow: visible;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: pointer;
}

/* 背景层（参考 Web 版 _itemBackdrop: absolute, overflow:hidden, border-radius:10px） */
.gift-backdrop {
    position: absolute;
    inset: 0;
    border-radius: 10px;
    overflow: hidden;
}

/* 光晕（参考 Web 版 _halo: absolute, 200×200, 居中, radial-gradient） */
.gift-halo {
    position: absolute;
    width: 200px;
    height: 200px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}

/* 背景图案层（参考 Web 版 emoji-pattern-canvas: absolute, overflow:clip, opacity 由外层控制） */
.gift-pattern {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 10px;
    opacity: 0.3;
    pointer-events: none;
}

/* 置顶图标：复用 gift-from 样式，与发送人头像同位置同大小 */
.gift-pin-icon {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 24px;
    height: 24px;
    z-index: 1;
    pointer-events: none;
}

/* 礼物贴纸（参考 Web 版 _itemSticker: position:relative, 82.667px, z-index:1） */
.gift-sticker {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
}

/* 右上角对角丝带（参考 Web 版 _badge: absolute, top:-2px, right:-4px, 58×58, clip-path） */
.gift-badge {
    position: absolute;
    top: -2px;
    right: -4px;
    width: 58px;
    height: 58px;
    z-index: 2;
    clip-path: path('M 51.8187 26.4853 L 28.8481 3.51472 C 26.5977 1.26428 23.5454 0 20.3628 0 H 2.1618 C 0.379992 0 -0.51234 2.15429 0.74759 3.41422 L 51.9192 54.5858 C 53.1791 55.8457 55.3334 54.9534 55.3334 53.1716 V 34.9706 C 55.3334 31.788 54.0691 28.7357 51.8187 26.4853 Z');
}

.gift-badge-text {
    display: block;
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    position: absolute;
    right: 0;
    top: 0;
    width: 58px;
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: matrix(0.707107, 0.707107, -0.707107, 0.707107, 3.53553, 17.6777);
    white-space: nowrap;
    line-height: 1;
    pointer-events: none;
}

/* 发送人头像容器（参考 Web 版 _itemFrom: absolute, top:0, left:0, 24×24, z-index:1） */
.gift-from {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 24px;
    height: 24px;
    z-index: 1;
}

/* 普通礼物卡片效果：浅色背景 + 边框 + 阴影 */
.gift-regular {
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid rgba(0, 0, 0, 0.06);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
:root.dark .gift-regular,
.dark .gift-regular {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* 背景图案：单个符号贴纸，绝对定位绕中心扩散 */
.pattern-cell {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>