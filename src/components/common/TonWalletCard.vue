<template>
    <!-- Gram 钱包卡片：按官方卡面 1:1 还原（1089×661 → 400×243）
         元素位置、字号、颜色都按参考图测量后换算，贴纸仍按 areaPosition 百分比定位 -->
    <div class="twc-scene" :style="sceneStyle">
        <div ref="rootEl" class="twc" :class="{ 'is-tilting': tilting }" :style="rootStyle" role="img"
            :aria-label="ariaLabel" @pointerdown="onTiltDown">
            <!-- 卡片厚度：同形状层沿 Z 轴叠出侧边，倾斜时才露出来 -->
            <div v-for="layer in THICKNESS_LAYERS" :key="layer" class="twc-edge"
                :style="{ transform: 'translateZ(-' + layer * 0.8 + 'px)' }" />

            <!-- 贴纸白描边：feMorphology 只按 alpha 膨胀再填白，半透明像素不会被叠成不透明 -->
            <svg class="twc-defs" aria-hidden="true">
                <defs>
                    <filter :id="stickerOutlineId" x="-15%" y="-15%" width="130%" height="130%"
                        color-interpolation-filters="sRGB">
                        <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="twc-dilated" />
                        <feFlood flood-color="#ffffff" result="twc-white" />
                        <feComposite in="twc-white" in2="twc-dilated" operator="in" result="twc-outline" />
                        <feMerge>
                            <feMergeNode in="twc-outline" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <!-- 符号图案的着色：用 flood 填色再按 alpha 合成，保留贴纸轮廓与透明度 -->
                    <filter :id="patternTintId" x="-5%" y="-5%" width="110%" height="110%"
                        color-interpolation-filters="sRGB">
                        <feFlood :flood-color="material.pattern" result="twc-pattern-fill" />
                        <feComposite in="twc-pattern-fill" in2="SourceAlpha" operator="in" />
                    </filter>
                </defs>
            </svg>

            <div class="twc-face">
                <div class="twc-surface" :class="{ 'is-sheen': !palette }" :style="surfaceStyle" />
                <!-- 背景礼物的符号图案：铺在材质之上、贴纸与文字之下（Telegram Desktop 的 PatternLayer） -->
                <div v-if="patternItems.length" class="twc-pattern"
                    :style="{ filter: 'url(#' + patternTintId + ')', opacity: material.patternOpacity }">
                    <div v-for="(item, index) in patternItems" :key="index" class="twc-pattern-symbol"
                        :style="item.style">
                        <MessageStickerContent v-if="patternMessage" :content="patternMessage" :size="item.size"
                            static />
                    </div>
                </div>
                <!-- 彩色光晕：跟着拖拽方向旋转、游走 -->
                <div class="twc-aurora" />
                <!-- 黑胶波纹 + 镜面反光，随 3D 倾斜移动 -->
                <div class="twc-vinyl" />
                <div class="twc-sheen" />
                <div class="twc-gloss" />
                <span v-for="(sparkle, index) in SPARKLES" :key="index" class="twc-sparkle"
                    :style="sparkleStyle(sparkle)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 0c1 8 4 11 12 12-8 1-11 4-12 12-1-8-4-11-12-12 8-1 11-4 12-12Z" fill="#ffffff" />
                    </svg>
                </span>

                <!-- 贴纸层：收藏礼物（NFT）贴纸，在背景之上、文字之下 -->
                <div class="twc-stickers" :class="{ 'is-hidden': !stickersVisible, 'is-revealing': revealStickers }">
                    <div v-for="(item, index) in stickers" :key="index" class="twc-sticker"
                        :class="{ 'is-selected': editable && index === selected, 'is-editable': editable }"
                        :style="stickerStyle(item)" @pointerdown="onStickerPointerDown(index, $event)">
                        <div class="twc-sticker-body"
                            :style="revealStickers ? { animationDelay: index * 190 + 'ms' } : undefined">
                            <TgsPlayer v-if="item.src && !item.sticker" :src="item.src" :size="stickerSide(item)"
                                :loop="false" :autoplay="false" :initial-frame="0" />
                            <MessageStickerContent v-else-if="stickerContent(item)" :content="stickerContent(item)!"
                                :size="stickerSide(item)" :static="true" />
                            <div v-else class="twc-sticker-empty">
                                <Gift class="h-1/2 w-1/2 opacity-70" />
                            </div>
                            <span v-if="editable" class="twc-sticker-ring" />
                        </div>
                    </div>
                </div>

                <!-- 信息层 -->
                <div class="twc-content">
                    <!-- 钻石：预置渲染（PALETTE_ICE 冰白）；加载完成前留空，不用平面兜底 -->
                    <canvas ref="stoneEl" class="twc-stone mr-2" :style="stoneStyle" />

                    <div class="twc-balance" :style="balanceStyle">
                        <span class="twc-amount"><span class="twc-amount-int">{{ balance.whole }}</span><span
                                class="twc-amount-frac">{{ balance.fraction }}</span></span>
                        <span class="twc-unit">GRAM</span>
                    </div>
                    <div v-if="fiat" class="twc-fiat" :style="fiatStyle">{{ fiat }}</div>

                    <div v-if="displayName" class="twc-name" :style="nameStyle">{{ displayName }}</div>

                    <!-- 右缘竖排地址：两列，最右列是前半段 -->
                    <div class="twc-address">
                        <span class="twc-address-col" :style="addressColStyle(0)">{{ addressColumns[0] }}</span>
                        <span v-if="addressColumns[1]" class="twc-address-col" :style="addressColStyle(1)">{{
                            addressColumns[1] }}</span>
                    </div>
                </div>

                <!-- 边缘光：倾斜时沿卡沿扫过一圈冷光 -->
                <div class="twc-rimlight" />
            </div>

            <!-- 白色金属 QR 芯片：凹进卡面（贴面 translateZ + 内阴影做出槽口），倾斜时为凹槽内壁吃光 -->
            <!-- 点芯片 = 打开收款二维码弹窗：按下仍然拖卡片做 3D，只有没拖动的 click 才算点击 -->
            <div class="twc-chip" :class="{ 'is-actionable': actionable }" :style="chipStyle"
                :role="actionable ? 'button' : undefined" :tabindex="actionable ? 0 : undefined"
                :aria-label="actionable ? qrLabel : undefined" @click.stop="onChipClick"
                @keydown.enter.prevent="onChipClick" @keydown.space.prevent="onChipClick">
                <svg class="twc-chip-glyph" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="2.2" y="2.2" width="7.4" height="7.4" rx="1.6" fill="none" stroke="#5B6168"
                        stroke-width="1.9" />
                    <rect x="14.4" y="2.2" width="7.4" height="7.4" rx="1.6" fill="none" stroke="#5B6168"
                        stroke-width="1.9" />
                    <rect x="2.2" y="14.4" width="7.4" height="7.4" rx="1.6" fill="none" stroke="#5B6168"
                        stroke-width="1.9" />
                    <rect x="14.4" y="14.4" width="2.6" height="2.6" rx="0.7" fill="#5B6168" />
                    <rect x="19.2" y="14.4" width="2.6" height="2.6" rx="0.7" fill="#5B6168" />
                    <rect x="16.8" y="17.2" width="2.6" height="2.6" rx="0.7" fill="#5B6168" />
                    <rect x="14.4" y="19.4" width="2.6" height="2.6" rx="0.7" fill="#5B6168" />
                    <rect x="19.2" y="19.4" width="2.6" height="2.6" rx="0.7" fill="#5B6168" />
                </svg>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { Gift } from 'lucide-vue-next';
import type { messageSticker, sticker } from 'tdlib-types';
import TgsPlayer from './TgsPlayer.vue';
import { useDiamondDrag } from '../../composables/useDiamondDrag';
import { getCardBackgroundUrl } from '../../utils/diamond/cardBackground';
import { PALETTE_ICE } from '../../utils/diamond/palette';
import { isFileReady, tdlibSend } from '../../utils/session/tdlib';
import { walletCardMaterialFromPalette } from '../../utils/wallet/walletCardMaterials';
import { walletCardPatternSlots } from '../../utils/wallet/walletCardPattern';
import MessageStickerContent from '../chat/ChatDetail/MessageContent/content/MessageStickerContent.vue';
import {
    formatGramBalance,
    type GramAmount,
} from '../../utils/message/tonTransfer';
import {
    DEFAULT_WALLET_CARD_PALETTE,
    WALLET_CARD_HEIGHT,
    WALLET_CARD_RADIUS,
    WALLET_CARD_WIDTH,
    walletCardStickerRect,
    type WalletCardPalette,
    type WalletCardStickerView,
} from '../../utils/wallet/walletCard';

/** 厚度层数：每层 0.8px，18 层约 14px 的侧边（400 宽设计稿），再厚就有塑料感 */
const THICKNESS_LAYERS = Array.from({ length: 18 }, (_, index) => index + 1);

/** 参考卡面上的装饰星点（百分比坐标） */
const SPARKLES = [
    { x: 8, y: 57, size: 9, opacity: 0.55 },
    { x: 31, y: 54, size: 6, opacity: 0.45 },
    { x: 47, y: 31, size: 5, opacity: 0.4 },
    { x: 67, y: 80, size: 8, opacity: 0.5 },
    { x: 89, y: 26, size: 6, opacity: 0.45 },
    { x: 17, y: 84, size: 5, opacity: 0.38 },
];

const props = withDefaults(defineProps<{
    address: string;
    balance: GramAmount;
    name?: string;
    stickers?: WalletCardStickerView[];
    /** 礼物配色；不传时用官方 Gram 品牌蓝 */
    palette?: WalletCardPalette | null;
    /** 背景礼物的符号贴纸：有它就铺一层卡面小图标（特殊卡） */
    symbolSticker?: sticker | null;
    fiat?: string;
    width?: number;
    editable?: boolean;
    /** 卡片是否支持按住拖动做 3D 倾斜（默认开启） */
    tiltable?: boolean;
    /** 贴纸层是否可见（展开动画期间先隐藏） */
    stickersVisible?: boolean;
    /** 贴纸从上方贴到卡面上的入场动画 */
    revealStickers?: boolean;
    /** 是否挂载预置 3D 钻石（贴纸落位后再打开） */
    diamondEnabled?: boolean;
    selected?: number;
    ariaLabel?: string;
    /** QR 芯片是否可点（点开后弹出收款二维码） */
    actionable?: boolean;
    /** 芯片的无障碍名称 */
    qrLabel?: string;
}>(), {
    name: '',
    stickers: () => [],
    palette: null,
    symbolSticker: null,
    fiat: '',
    width: WALLET_CARD_WIDTH,
    editable: false,
    tiltable: true,
    stickersVisible: true,
    revealStickers: false,
    diamondEnabled: true,
    selected: -1,
    ariaLabel: '',
    actionable: false,
    qrLabel: 'QR',
});

const emit = defineEmits<{
    (e: 'sticker-pointerdown', index: number, event: PointerEvent): void;
    (e: 'qr-click'): void;
}>();

const rootEl = ref<HTMLElement | null>(null);
const stoneEl = ref<HTMLCanvasElement | null>(null);

/** 预置钻石：冰白配色（钱包卡片专用），自转展示，不做按压 / 拖拽 */
const { mount: mountStone, unmount: unmountStone } = useDiamondDrag({
    canvas: stoneEl,
    palette: PALETTE_ICE,
    viewportGate: false,
    pressZoom: false,
    // 大卡片上的钻石要自转（默认开启）；缩略卡在 TonWalletCardMini 里单独关掉
});

// ---------- 3D 拖拽倾斜 ----------
const tilting = ref(false);
let tilt: { pointerId: number; startX: number; startY: number; rect: DOMRect; active: boolean } | null = null;
/** 按下后移动超过这个距离才算拖拽，否则当成一次点击（点礼物不该让卡片歪一下） */
const TILT_DEAD_ZONE = 4;
/**
 * 本次按压是否真的拖成了倾斜。
 *
 * 浏览器在 pointerup 之后照样补一个 click：从 QR 芯片上开始拖卡片，
 * 松手时就会「顺带」点开收款弹窗。所以拖拽结束时记一笔，交给 click 消费掉。
 */
let dragMoved = false;

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 按压是否落在礼物贴纸上（贴纸里是 canvas / WebGL 渲染，用整条事件路径判断最稳） */
function isStickerPress(event: PointerEvent): boolean {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
        if (node instanceof Element && node.classList.contains('twc-sticker')) return true;
    }
    const target = event.target;
    return target instanceof Element && !!target.closest('.twc-sticker');
}

function onTiltDown(event: PointerEvent) {
    // 每次新的按压都重置：上一次拖拽留下的标记不能跨到这一次点击上
    dragMoved = false;
    if (!props.tiltable || event.button !== 0 || prefersReducedMotion()) return;
    // 编辑态下按在礼物上是拖动礼物，不是拖卡片；展示态照样可以从礼物上拖卡片
    if (props.editable && isStickerPress(event)) return;
    const element = rootEl.value;
    if (!element) return;
    tilt = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        rect: element.getBoundingClientRect(),
        active: false,
    };
    window.addEventListener('pointermove', onTiltMove);
    window.addEventListener('pointerup', onTiltUp, { once: true });
    window.addEventListener('pointercancel', onTiltUp, { once: true });
}

function onTiltMove(event: PointerEvent) {
    const state = tilt;
    const element = rootEl.value;
    if (!state || !element) return;
    if (!state.active) {
        // 死区内只算点击：卡片保持平放，不进入倾斜态
        if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < TILT_DEAD_ZONE) return;
        state.active = true;
        dragMoved = true;
        tilting.value = true;
    }
    // 触控/鼠标统一：灵敏度放大，半个卡宽/高为最大拖拽量，横向 ±34°、纵向 ±26°
    const dx = Math.max(-0.6, Math.min(0.6, ((event.clientX - state.startX) / state.rect.width) * 1.35));
    const dy = Math.max(-0.6, Math.min(0.6, ((event.clientY - state.startY) / state.rect.height) * 1.35));
    element.style.transform = 'rotateX(' + (-dy * 26).toFixed(2)
        + 'deg) rotateY(' + (dx * 34).toFixed(2) + 'deg)';
    // 光从靠近观者的一侧打过来：rotateY(+dx) 时左沿翘向观者，rotateX(-dy) 时上沿翘向观者，
    // 所以高光、边缘光、蓝色光晕都往“近侧”走，别跟着拖拽方向走（那样是反的）
    element.style.setProperty('--chip-shine-x', (50 - dx * 42).toFixed(1) + '%');
    element.style.setProperty('--chip-shine-y', (38 - dy * 34).toFixed(1) + '%');
    element.style.setProperty('--rim-x', (50 - dx * 118).toFixed(1) + '%');
    element.style.setProperty('--rim-y', (50 - dy * 118).toFixed(1) + '%');
    element.style.setProperty('--aurora-x', (34 - dx * 46).toFixed(1) + '%');
    element.style.setProperty('--aurora-y', (42 - dy * 40).toFixed(1) + '%');
    element.style.setProperty('--aurora-rotate', (dx * -26).toFixed(2) + 'deg');
    element.style.setProperty('--gloss-x', (50 - dx * 40).toFixed(1) + '%');
    element.style.setProperty('--gloss-y', (50 - dy * 38).toFixed(1) + '%');
    element.style.setProperty('--vinyl-rotate', (dx * 7).toFixed(2) + 'deg');
}

function onTiltUp() {
    const element = rootEl.value;
    tilting.value = false;
    tilt = null;
    window.removeEventListener('pointermove', onTiltMove);
    if (element) {
        element.style.transform = '';
        element.style.removeProperty('--chip-shine-x');
        element.style.removeProperty('--chip-shine-y');
        element.style.removeProperty('--rim-x');
        element.style.removeProperty('--rim-y');
        element.style.removeProperty('--aurora-x');
        element.style.removeProperty('--aurora-y');
        element.style.removeProperty('--aurora-rotate');
    }
}

/** 预渲染但先隐藏：贴纸落位前画布透明，准备就绪后直接显示 3D */
function startStone() {
    mountStone();
}

onMounted(startStone);
onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onTiltMove);
    unmountStone();
});

const scale = computed(() => props.width / WALLET_CARD_WIDTH);
const height = computed(() => Math.round(props.width * (WALLET_CARD_HEIGHT / WALLET_CARD_WIDTH)));
const balance = computed(() => formatGramBalance(props.balance));
const displayName = computed(() => props.name.trim().toUpperCase());

/** 3D 材质：蓝卡沿用原来的冷色，礼物卡按 backdrop 的色相重新拟合 */
const material = computed(() => walletCardMaterialFromPalette(props.palette));

/** 符号图案：背景礼物的 symbol 贴纸，按六边形点阵铺在卡面上 */
const patternMessage = computed<messageSticker | null>(() => (props.symbolSticker
    ? { _: 'messageSticker', sticker: props.symbolSticker, is_premium: false }
    : null));

/**
 * 先把这个符号文件下一次，再铺 22 个实例。
 * 每个 MessageStickerContent 只会在自己发起下载时收到结果；同时挂 22 个的话，
 * 只有第一个能拿到文件，其余会一直空着。
 */
const patternReady = ref(false);
let patternSeq = 0;
watch(() => props.symbolSticker, async (symbol) => {
    const seq = ++patternSeq;
    patternReady.value = false;
    const file = symbol?.sticker;
    if (!file) return;
    if (isFileReady(file)) {
        patternReady.value = true;
        return;
    }
    if (!file.local.can_be_downloaded) return;
    try {
        const downloaded = await tdlibSend({
            _: 'downloadFile',
            file_id: file.id,
            priority: 16,
            offset: 0,
            limit: 0,
            synchronous: true,
        });
        if (seq === patternSeq && isFileReady(downloaded as any)) patternReady.value = true;
    } catch {
        // 离线 / 下载失败：不铺图案，卡片颜色与 3D 仍然可用
    }
}, { immediate: true });

function px(value: number): string {
    return (value * scale.value).toFixed(2) + 'px';
}

const sceneStyle = computed(() => ({
    width: props.width + 'px',
    height: height.value + 'px',
}));

/** 贴纸白描边的滤镜 id：同页可能有多张卡，id 必须唯一 */
const stickerOutlineId = 'twc-sticker-outline-' + useId();
/** 符号图案着色滤镜 id：同样需要唯一 */
const patternTintId = 'twc-pattern-tint-' + useId();

const patternItems = computed(() => {
    if (!patternReady.value || !patternMessage.value) return [];
    return walletCardPatternSlots(props.width, height.value).map((slot) => ({
        size: Math.max(1, Math.round(slot.size * 100) / 100),
        style: {
            left: (slot.x - slot.size / 2).toFixed(2) + 'px',
            top: (slot.y - slot.size / 2).toFixed(2) + 'px',
            width: slot.size.toFixed(2) + 'px',
            height: slot.size.toFixed(2) + 'px',
            opacity: slot.alpha.toFixed(3),
        } as Record<string, string>,
    }));
});

const rootStyle = computed<Record<string, string>>(() => ({
    width: '100%',
    height: '100%',
    borderRadius: WALLET_CARD_RADIUS * scale.value + 'px',
    '--twc-radius': WALLET_CARD_RADIUS * scale.value + 'px',
    '--twc-accent': material.value.accent,
    '--twc-text': (props.palette ?? DEFAULT_WALLET_CARD_PALETTE).text,
    '--twc-sticker-outline': 'url(#' + stickerOutlineId + ')',
    '--twc-bg': material.value.background,
    '--twc-sheen': material.value.sheen,
    '--twc-edge-1': material.value.layers.edgeTop,
    '--twc-edge-2': material.value.layers.edgeBottom,
    '--twc-aurora-core': material.value.layers.auroraCore,
    '--twc-aurora-mid': material.value.layers.auroraMid,
    '--twc-rim-core': material.value.layers.rimCore,
    '--twc-rim-mid': material.value.layers.rimMid,
    '--twc-rim-bevel': material.value.layers.rimBevel,
    '--twc-sheen-a': material.value.layers.sheenA,
    '--twc-sheen-b': material.value.layers.sheenB,
    '--twc-sheen-c': material.value.layers.sheenC,
    '--twc-chip-tint': material.value.layers.chipTint,
    '--twc-shadow': material.value.layers.shadow,
    '--twc-glow': material.value.layers.glow,
    '--twc-spark': material.value.layers.spark,
    '--twc-fiat': material.value.layers.fiat,
    '--twc-unit-shadow': material.value.layers.unitShadow,
    '--twc-address': material.value.layers.address,
    '--twc-stone-shadow': material.value.layers.stoneShadow,
}));

/**
 * 品牌卡面：与「收到 Gram 转账」气泡共用同一张程序化光场底图
 * （八阶切比雪夫光晕），2× 生成后铺满卡片，再按转账卡片的方式放大 1.22 倍。
 * 礼物背景仍然用 backdrop 中心色 → 边缘色的径向渐变。
 */
const surfaceStyle = computed(() => {
    if (!props.palette) {
        return {
            backgroundImage: 'url(' + getCardBackgroundUrl(props.width * 2, height.value * 2) + ')',
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
        };
    }
    return {
        background: 'radial-gradient(120% 150% at 34% 42%, ' + props.palette.center
            + ' 0%, ' + props.palette.edge + ' 100%)',
    };
});

const stoneStyle = computed(() => ({
    left: px(19),
    top: px(75),
    width: px(56),
    height: px(56),
    opacity: props.diamondEnabled ? '1' : '0',
}));

const balanceStyle = computed(() => ({
    left: px(66),
    top: px(86),
    fontSize: px(29),
}));

const fiatStyle = computed(() => ({
    left: px(41),
    top: px(119),
    fontSize: px(18),
}));

/** 芯片反射的卡面光场：礼物卡用礼物颜色，否则用品牌蓝的程序化光场 */
const cardLightField = computed(() => (props.palette
    ? 'radial-gradient(120% 150% at 34% 42%, ' + props.palette.center
    + ' 0%, ' + props.palette.edge + ' 100%)'
    : 'url(' + getCardBackgroundUrl(props.width * 2, height.value * 2) + ')'));

const chipStyle = computed(() => ({
    left: px(289),
    top: px(88),
    width: px(56),
    height: px(42),
    // 只留 0.2px 的 Z 偏移保证渲染顺序，实际贴合卡面，不再浮起
    transform: 'translateZ(' + (0.2 * scale.value).toFixed(2) + 'px)',
    // 银色芯片 + 卡片同一张光场（soft-light），让主卡的光晕在银色表面反出来；
    // 明暗竖向翻转（上暗下亮），配合内阴影读作“陷在槽底”而不是凸起
    backgroundImage: cardLightField.value + ', '
        + 'linear-gradient(180deg, #dde2e8 0%, #e7ebf0 32%, #f2f5f8 62%, #f9fbfc 82%, #e6eaef 100%)',
    backgroundSize: props.palette ? '100% 100%, 100% 100%' : '260% 260%, 100% 100%',
    backgroundPosition: props.palette ? 'center, center' : '46% 42%, center',
    backgroundBlendMode: 'soft-light, normal',
}));

const nameStyle = computed(() => ({
    left: px(30),
    bottom: px(20),
    fontSize: px(13.5),
}));

const addressColumns = computed(() => {
    const groups = (props.address || '').trim().toUpperCase().match(/.{1,4}/g) ?? [];
    return [groups.slice(0, 6).join(' '), groups.slice(6).join(' ')];
});

function addressColStyle(column: number): Record<string, string> {
    return {
        left: px(column === 0 ? 383 : 370),
        top: px(12),
        width: px(220),
        fontSize: px(11),
        lineHeight: px(11.2),
        letterSpacing: px(1.5),
    };
}

function sparkleStyle(sparkle: { x: number; y: number; size: number; opacity: number }) {
    const size = sparkle.size * scale.value;
    return {
        left: sparkle.x + '%',
        top: sparkle.y + '%',
        width: size + 'px',
        height: size + 'px',
        opacity: String(sparkle.opacity),
    };
}

function stickerStyle(item: WalletCardStickerView) {
    const rect = walletCardStickerRect(item.position, props.width, height.value);
    return {
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        borderRadius: rect.radius + 'px',
        transform: 'rotate(' + rect.rotation + 'deg)',
    };
}

function stickerSide(item: WalletCardStickerView): number {
    const rect = walletCardStickerRect(item.position, props.width, height.value);
    return Math.round(Math.max(rect.width, rect.height));
}

function stickerContent(item: WalletCardStickerView): messageSticker | null {
    if (!item.sticker) return null;
    return { _: 'messageSticker', sticker: item.sticker, is_premium: false };
}

/** 点 QR 芯片：只在卡片可操作时响应；拖拽倾斜由 pointermove 判定，不会误触 */
function onChipClick() {
    // 拖动过卡片：这个 click 是松手补发的，不算点击芯片
    if (dragMoved) {
        dragMoved = false;
        return;
    }
    if (!props.actionable) return;
    emit('qr-click');
}

function onStickerPointerDown(index: number, event: PointerEvent) {
    // 只有编辑态才由礼物消费按下（拖动礼物改位置）；
    // 展示态让事件继续冒泡，按在礼物上也能拖动卡片做 3D 倾斜
    if (!props.editable) return;
    event.stopPropagation();
    emit('sticker-pointerdown', index, event);
}

defineExpose({ getElement: () => rootEl.value });
</script>

<style scoped>
.twc-scene {
    position: relative;
    flex: none;
    perspective: 1200px;
    perspective-origin: 50% 45%;
}

.twc {
    position: relative;
    width: 100%;
    height: 100%;
    touch-action: none;
    transform-style: preserve-3d;
    will-change: transform;
    transition: transform 340ms cubic-bezier(0.2, 0.8, 0.2, 1);
    user-select: none;
    color: var(--twc-text, #fff);
    font-family: inherit;
}

.twc.is-tilting {
    transition: none;
}

/* 滤镜定义画布：只放 <defs>，不占位、不接事件 */
.twc-defs {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
}

/* 厚度：同形状的暗色层沿 Z 轴向后叠，倾斜时露出的就是卡片侧边；
   颜色来自卡片材质，粉 / 橙 / 黑卡不会再露出一圈蓝边 */
.twc-edge {
    position: absolute;
    inset: 0;
    border-radius: var(--twc-radius, 15px);
    background: linear-gradient(180deg, var(--twc-edge-1, #0a4d90) 0%, var(--twc-edge-2, #052f5c) 100%);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.05);
    backface-visibility: hidden;
}

.twc-face {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: var(--twc-radius, 15px);
    background: var(--twc-bg, #0479e6);
    isolation: isolate;
    box-shadow:
        0 24px 48px -20px var(--twc-shadow, rgb(0 38 74 / 0.5)),
        0 2px 6px rgb(0 30 60 / 0.14),
        inset 0 1px 0 rgb(255 255 255 / 0.22);
    transition: box-shadow 260ms ease-out;
}

/* 倾斜时整卡泛出一层与卡片同色相的光，卡片像从底面上立起来 */
.twc.is-tilting .twc-face {
    box-shadow:
        0 24px 48px -20px var(--twc-shadow, rgb(0 38 74 / 0.5)),
        0 2px 6px rgb(0 30 60 / 0.14),
        inset 0 1px 0 rgb(255 255 255 / 0.22),
        0 0 28px 2px var(--twc-glow, rgb(92 198 255 / 0.32));
}

/* 彩色光晕：圆心与角度都跟着拖拽走，倾斜时卡面底色像在转动 */
.twc-aurora {
    position: absolute;
    inset: -34%;
    pointer-events: none;
    mix-blend-mode: screen;
    opacity: 0.72;
    background: radial-gradient(42% 46% at var(--aurora-x, 34%) var(--aurora-y, 42%),
            var(--twc-aurora-core, rgb(150 235 255 / 0.34)) 0%,
            var(--twc-aurora-mid, rgb(52 168 255 / 0.2)) 36%,
            transparent 72%);
    transform: rotate(var(--aurora-rotate, 0deg));
    transition: transform 340ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* 边缘光：只保留 2px 外沿的一圈，光斑位置随倾斜方向移动 */
.twc-rimlight {
    position: absolute;
    inset: 0;
    z-index: 3;
    padding: 2px;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
    background: radial-gradient(58% 70% at var(--rim-x, 50%) var(--rim-y, 50%),
            var(--twc-rim-core, rgb(255 255 255 / 0.95)) 0%,
            var(--twc-rim-mid, rgb(170 238 255 / 0.62)) 30%,
            var(--twc-rim-bevel, rgb(90 200 255 / 0.16)) 62%,
            transparent 80%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    transition: opacity 260ms ease-out;
}

.twc.is-tilting .twc-rimlight {
    opacity: 1;
}

/* 不支持 mask-composite 的旧 WebView：退回一圈均匀冷光，别让光斑盖住整张卡 */
@supports not ((mask-composite: exclude) or (-webkit-mask-composite: xor)) {
    .twc-rimlight {
        -webkit-mask: none;
        mask: none;
        background: none;
        box-shadow: inset 0 0 0 1.5px var(--twc-rim-mid, rgb(170 238 255 / 0.5));
    }
}

/* 背景符号层：在卡面材质之上、贴纸与文字之下（Telegram Desktop 的 PatternLayer） */
.twc-pattern {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
}

.twc-pattern-symbol {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
}

.twc-surface {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

/* 与转账卡片一致：底图放大 1.22 倍，四角不会被圆角裁出空隙 */
.twc-surface.is-sheen {
    transform: scale(1.22);
}

/* 黑胶唱片：细密同心纹 + 缓慢转动的彩色反光带 */
.twc-vinyl {
    position: absolute;
    inset: -26%;
    pointer-events: none;
    opacity: 0.95;
    mix-blend-mode: soft-light;
    background: repeating-radial-gradient(circle at 50% 50%,
            rgb(255 255 255 / 0.095) 0 1.2px,
            rgb(255 255 255 / 0) 1.2px 7.5px);
    transform: rotate(var(--vinyl-rotate, 0deg));
    transition: transform 340ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* 黑胶反光：两束柔和的锥形光带，倾斜时缓慢扫过卡面 */
.twc-sheen {
    position: absolute;
    inset: -22%;
    pointer-events: none;
    opacity: 0.8;
    mix-blend-mode: screen;
    background: conic-gradient(from calc(205deg + var(--vinyl-rotate, 0deg)) at 50% 50%,
            transparent 0deg,
            var(--twc-sheen-a, rgb(140 230 255 / 0.18)) 24deg,
            transparent 58deg,
            var(--twc-sheen-b, rgb(255 255 255 / 0.16)) 114deg,
            transparent 162deg,
            var(--twc-sheen-c, rgb(140 230 255 / 0.14)) 212deg,
            transparent 270deg,
            var(--twc-sheen-b, rgb(255 255 255 / 0.12)) 316deg,
            transparent 360deg);
    transition: background 340ms ease-out;
}

/* 整卡镜面高光：跟着拖拽方向走 */
.twc-gloss {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(48% 52% at var(--gloss-x, 50%) var(--gloss-y, 50%),
            rgb(255 255 255 / 0.16) 0%,
            rgb(255 255 255 / 0.05) 45%,
            rgb(255 255 255 / 0) 72%);
    mix-blend-mode: screen;
}

.twc-sparkle {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
}

.twc-sparkle svg {
    width: 100%;
    height: 100%;
    display: block;
}

.twc-sparkle svg path {
    fill: var(--twc-spark, #ffffff);
}

.twc-stickers {
    position: absolute;
    inset: 0;
    z-index: 1;
    /* 只有礼物本身接事件，贴纸层的空白处仍然归卡片（可以拖 3D） */
    pointer-events: none;
}

.twc-stickers.is-hidden {
    opacity: 0;
}

.twc-sticker-body {
    width: 100%;
    height: 100%;
    /* 收藏礼物贴纸的白描边：官方卡面给贴纸描一圈白，彩色贴纸压在蓝底上才有边界。
       用 SVG 滤镜（feMorphology 膨胀 alpha 再填白）而不是叠 drop-shadow：
       drop-shadow 是链式叠加，贴纸自带的半透明软边会一层层叠成不透明；
       feMorphology 取邻域 alpha 最大值，半透明部分仍是半透明。 */
    filter: var(--twc-sticker-outline, none);
}

/* 展开后贴纸逐枚生成：先大后小落到卡面，落位后再点开 3D 钻石 */
.twc-stickers.is-revealing .twc-sticker-body {
    animation: twc-sticker-drop 700ms cubic-bezier(0.2, 0.9, 0.3, 1.08) both;
}

@keyframes twc-sticker-drop {
    0% {
        transform: scale(1.5);
        opacity: 0;
    }

    45% {
        opacity: 1;
    }

    72% {
        transform: scale(0.96);
    }

    100% {
        transform: scale(1);
        opacity: 1;
    }
}

.twc-sticker {
    position: absolute;
    transform-origin: center;
    will-change: transform;
    pointer-events: auto;
    filter:
        drop-shadow(0 0 1px rgb(0 20 40 / 0.45)) drop-shadow(0 6px 10px rgb(0 30 60 / 0.25));
}

.twc-sticker.is-editable {
    cursor: grab;
    touch-action: none;
}

.twc-sticker.is-editable:active {
    cursor: grabbing;
}

.twc-sticker-ring {
    position: absolute;
    inset: -5px;
    border: 1px dashed rgb(255 255 255 / 0.9);
    border-radius: 10px;
    opacity: 0;
    transition: opacity 120ms ease-out;
    pointer-events: none;
}

.twc-sticker.is-selected .twc-sticker-ring {
    opacity: 1;
}

.twc-sticker-empty {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: inherit;
    background: rgb(255 255 255 / 0.14);
    color: rgb(255 255 255 / 0.85);
}

.twc-content {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
}

.twc-stone {
    position: absolute;
    cursor: default;
    touch-action: none;
    user-select: none;
    filter: drop-shadow(0 3px 7px var(--twc-stone-shadow, rgb(0 50 100 / 0.28)));
}

.twc-balance {
    position: absolute;
    display: flex;
    align-items: baseline;
    white-space: nowrap;
    line-height: 1;
}

.twc-amount {
    font-weight: 500;
    letter-spacing: 0.035em;
    font-variant-numeric: tabular-nums;
    color: var(--twc-text, #fff);
    /* 余额压在卡面上：一层很浅的向下投影，跟着卡面的材质走，但不抢镜面高光 */
    text-shadow: 0 1px 3px var(--twc-unit-shadow, rgb(0 40 85 / 0.3));
}

/* 小数点后的位数小一号 */
.twc-amount-frac {
    font-size: 0.72em;
    font-weight: 500;
    letter-spacing: 0.02em;
}

.twc-unit {
    margin-left: 0.22em;
    font-size: 1.02em;
    /* 和金额一样收到 500：600 在青色上显得太粗，压不住“钱”的轻盈感 */
    font-weight: 500;
    letter-spacing: 0.01em;
    transform: scaleX(0.9);
    transform-origin: left center;
    color: var(--twc-accent, #6cdbff);
    /* GRAM 比白字亮，阴影深一档才立得住；和余额共用同一束投影方向 */
    text-shadow: 0 1px 3px var(--twc-unit-shadow, rgb(0 40 85 / 0.34));
}

.twc-fiat {
    position: absolute;
    transform: scaleX(0.8);
    transform-origin: left center;
    color: var(--twc-fiat, rgb(168 240 255 / 0.95));
    font-weight: 500;
    letter-spacing: 0.01em;
    text-shadow: 0 1px 4px var(--twc-unit-shadow, rgb(0 50 100 / 0.2));
}

.twc-chip.is-actionable {
    cursor: pointer;
}

.twc-chip.is-actionable:focus-visible {
    outline: 2px solid rgb(255 255 255 / 0.85);
    outline-offset: 2px;
}

.twc-chip {
    position: absolute;
    border-radius: 8px;
    /* 拉丝银面：细横纹 + 银白渐变，模拟真实芯片的金属底座 */
    background:
        repeating-linear-gradient(90deg,
            rgb(255 255 255 / 0.22) 0 1px,
            rgb(0 0 0 / 0.025) 1px 1px),
        linear-gradient(180deg, #dde2e8 0%, #e7ebf0 32%, #f2f5f8 62%, #f9fbfc 82%, #e6eaef 100%);
    border: 1px solid #9aa1a9;
    /* 凹槽：顶部内壁被槽口挡光压暗，底部内壁吃光，外侧压一圈暗边；只压一档，别压成深坑 */
    box-shadow:
        inset 0 2px 3px rgb(0 16 38 / 0.34),
        inset 0 1px 0 rgb(0 16 38 / 0.2),
        inset 1px 0 2px rgb(0 16 38 / 0.14),
        inset -1px 0 2px rgb(0 16 38 / 0.08),
        inset 0 -1px 1px rgb(255 255 255 / 0.45),
        0 0 0 1px rgb(0 18 42 / 0.22),
        0 1px 0 rgb(255 255 255 / 0.22),
        0 2px 4px rgb(0 20 45 / 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}

/* 芯片内圈的凹槽刻线 */
.twc-chip::before {
    content: '';
    position: absolute;
    inset: 11%;
    border-radius: 6px;
    border: 1px solid rgb(255 255 255 / 0.45);
    /* 刻线也按凹下去处理：上沿暗、下沿吃光 */
    box-shadow:
        inset 0 1px 1px rgb(0 0 0 / 0.12),
        0 1px 0 rgb(255 255 255 / 0.35);
    pointer-events: none;
}

/* 金属高光：随 3D 倾斜在芯片上移动 */
.twc-chip::after {
    content: '';
    position: absolute;
    inset: -35%;
    pointer-events: none;
    background: radial-gradient(54% 60% at var(--chip-shine-x, 42%) var(--chip-shine-y, 30%),
            rgb(255 255 255 / 0.6) 0%,
            var(--twc-chip-tint, rgb(214 240 255 / 0.2)) 46%,
            transparent 74%);
    mix-blend-mode: screen;
}

.twc-chip.is-tilting,
.twc.is-tilting .twc-chip::after {
    transition: none;
}

.twc.is-tilting {
    transition: none;
}

.twc-chip-glyph {
    position: relative;
    z-index: 1;
    width: 46%;
    height: 46%;
}

.twc-name {
    position: absolute;
    font-weight: 700;
    letter-spacing: -0.03em;
    text-transform: uppercase;
    color: var(--twc-text, #ffffff);
    text-shadow: 0 2px 8px var(--twc-stone-shadow, rgb(0 50 100 / 0.25));
}

.twc-address {
    position: absolute;
    inset: 0;
}

.twc-address-col {
    position: absolute;
    /* 横排后顺时针旋转 90°，字头朝右、自上而下 */
    transform-origin: top left;
    transform: rotate(90deg);
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    /* 与 Gram 转账卡片的地址同一套做法：官方先用 6% 白在同位置描一遍再叠正文，
       这里用同向 1px 阴影代替，字才有压在卡面上的立体感 */
    color: var(--twc-address, rgb(0 69 208 / 0.85));
    text-shadow: 0 1px 0 rgb(255 255 255 / 0.16);
    text-transform: uppercase;
}
</style>
