<template>
    <!-- Gram 转账卡片：尺寸与排版逐条对齐 Telegram Android 的 WalletActionLayout
         （卡片 198×132dp、圆角 16dp、钻石 42dp 位于顶部 +8dp、金额中心 +55dp、
         地址底边 -7dp），背景是程序化生成的八阶光场，不引用任何位图资产。 -->
    <div class="ton-card" :style="cardStyle">
        <div class="ton-card-sheen" :style="sheenStyle" />

        <!-- 右上角斜切缎带：GiftSheet.RibbonDrawable 的 48×48 贝塞尔原值，
             被卡片 16dp 圆角裁掉外角，所以它永远不会把卡角顶成直角 -->
        <svg class="ton-card-ribbon" viewBox="0 0 48 48" aria-hidden="true">
            <path :d="RIBBON_PATH" :fill="ribbonColor" />
            <text class="ton-card-ribbon-label" x="30" y="18" transform="rotate(45 30 18)"
                :style="{ fontSize: `${ribbonFontSize}px` }">{{ label }}</text>
        </svg>

        <!-- 钻石：单例 WebGL 上下文离屏渲染后逐帧贴到这块画布上 -->
        <canvas ref="stoneEl" class="ton-card-stone" @pointerdown="onPointerDown"
            @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
            @lostpointercapture="onPointerUp" />

        <div class="ton-card-amount">
            <span class="ton-card-amount-number">{{ amount.sign }}{{ amount.whole }}<span
                    class="ton-card-amount-fraction">{{ amount.fraction }}</span></span>
            <span class="ton-card-amount-unit">{{ t('lng_action_gram_transfer_ticker', 1) }}</span>
        </div>

        <div class="ton-card-name">{{ name }}</div>

        <div class="ton-card-address">{{ addressText }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getCardBackgroundUrl } from '../../../../../utils/diamond/cardBackground';
import { mountDiamond, type DiamondHandle } from '../../../../../utils/diamond/stage';
import { onVisibilityChange } from '../../../../../composables/useSharedIntersectionObserver';
import { DIAMOND_MOTION } from '../../../../../utils/diamond/motion';
import {
    formatGramAddress,
    formatGramAmount,
    TON_CARD_HEIGHT,
    TON_CARD_RADIUS,
    TON_CARD_WIDTH,
    TON_RIBBON_COLORS,
    type TonTransferStatus,
} from '../../../../../utils/tonTransfer';

const { t } = useI18n();

/** 底色位图的生成倍率：平滑光场 2× 足够，再高只是白白多算一遍 */
const BACKGROUND_SCALE = 2;
/** 按压放大的视觉上限：官方 3× 会把整张卡盖住，聊天里收一点 */
const PRESS_LIMIT = 2.2;

/** GiftSheet.RibbonDrawable.fillRibbonPath 的原始路径（48×48 坐标系） */
const RIBBON_PATH = 'M46.83 24.5 L23.5 1.17 C22.75 .42 21.73 0 20.68 0 '
    + 'C19.62 0 2.73 .05 1.55 .05 C.36 .05 -.23 1.4885 .6 2.32 '
    + 'L45.72 47.44 C46.56 48.28 48 47.68 48 46.5 L48 27.32 C48 26.26 47.5 25.24 46.82 24.5 Z';

const props = defineProps<{
    /** 最小单位的有符号金额（负数出账） */
    amount: number;
    /** TON 地址（48 字符 base64url） */
    address: string;
    /** 对方显示名 */
    name: string;
    /** 缎带状态 */
    status: TonTransferStatus;
    /** 缎带文案（已本地化） */
    label: string;
}>();

const stoneEl = ref<HTMLCanvasElement | null>(null);
let diamond: DiamondHandle | null = null;
let releaseVisibility: (() => void) | null = null;
let pointerId: number | null = null;
let lastX = 0;
let lastY = 0;

const amount = computed(() => formatGramAmount(props.amount));
const addressText = computed(() => formatGramAddress(props.address));
const ribbonColor = computed(() => TON_RIBBON_COLORS[props.status]);

const cardStyle = computed(() => ({
    width: `${TON_CARD_WIDTH}px`,
    height: `${TON_CARD_HEIGHT}px`,
    borderRadius: `${TON_CARD_RADIUS}px`,
}));

/** 底色只生成一次，所有卡片共用同一张 data URL */
const sheenStyle = computed(() => ({
    backgroundImage: `url(${getCardBackgroundUrl(TON_CARD_WIDTH * BACKGROUND_SCALE, TON_CARD_HEIGHT * BACKGROUND_SCALE)})`,
}));

/** 缎带文字超过 40dp 就等比缩小（drawText 的 scale 规则），避免溢出带子 */
const ribbonFontSize = computed(() => {
    const width = [...props.label].reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2e80 ? 1 : 0.56), 0);
    if (width <= 0) return 9;
    return Math.min(9, (40 / width) * 0.98);
});

function applyPressTransform(motion: { pressScale: number; pressOrigin: { x: number; y: number } }) {
    const canvas = stoneEl.value;
    if (!canvas) return;
    const scale = Math.min(motion.pressScale, PRESS_LIMIT);
    canvas.style.transformOrigin = `${motion.pressOrigin.x * 100}% ${motion.pressOrigin.y * 100}%`;
    canvas.style.transform = `scale(${scale.toFixed(4)})`;
}

function onPointerDown(event: PointerEvent) {
    const canvas = stoneEl.value;
    if (!canvas || pointerId !== null || !diamond) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    lastX = event.clientX;
    lastY = event.clientY;
    diamond.motion.beginDrag();
    diamond.motion.setPressed(true);
    diamond.setUrgent(true);
    event.preventDefault();
}

function onPointerMove(event: PointerEvent) {
    if (pointerId === null || event.pointerId !== pointerId || !diamond) return;
    // DOM 报的就是 CSS 像素，与 Unigram 传入的逻辑像素同一量纲
    diamond.motion.drag(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
}

function onPointerUp(event: PointerEvent) {
    const canvas = stoneEl.value;
    if (pointerId === null || event.pointerId !== pointerId) return;
    if (canvas?.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
    diamond?.motion.endDrag();
    diamond?.motion.setPressed(false);
    diamond?.setUrgent(false);
}

function mountStone() {
    const canvas = stoneEl.value;
    if (!canvas || diamond) return;
    diamond = mountDiamond({
        target: canvas,
        // 卡片在聊天里只有 42dp，按压放大到 3× 会盖住整张卡
        onFrame: applyPressTransform,
    });
    applyPressTransform({ pressScale: 1, pressOrigin: DIAMOND_MOTION.pressScaleOrigin });
    releaseVisibility = onVisibilityChange(
        canvas,
        () => diamond?.setVisible(true),
        () => diamond?.setVisible(false),
    );
}

onMounted(mountStone);

watch(() => props.amount, () => diamond?.invalidate());

onBeforeUnmount(() => {
    releaseVisibility?.();
    releaseVisibility = null;
    diamond?.dispose();
    diamond = null;
});
</script>

<style scoped>
.ton-card {
    position: relative;
    overflow: hidden;
    flex: none;
    isolation: isolate;
}

.ton-card-sheen {
    position: absolute;
    inset: 0;
    background-position: center;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    pointer-events: none;
}

.ton-card-ribbon {
    position: absolute;
    top: 0;
    right: 0;
    width: 48px;
    height: 48px;
    display: block;
    pointer-events: none;
}

.ton-card-ribbon-label {
    font-family: inherit;
    font-weight: 600;
    letter-spacing: 0.02em;
    fill: #fff;
    text-anchor: middle;
    dominant-baseline: central;
}

/* iconSize dp(42)，restingTop = cardRect.top + dp(8) */
.ton-card-stone {
    position: absolute;
    left: 50%;
    top: 8px;
    width: 42px;
    height: 42px;
    margin-left: -21px;
    cursor: grab;
    touch-action: none;
    user-select: none;
}

.ton-card-stone:active {
    cursor: grabbing;
}

/* amountCenterY = cardRect.top + dp(55) + height/2（16sp 行高约 18dp） */
.ton-card-amount {
    position: absolute;
    left: 0;
    right: 0;
    top: 55px;
    height: 18px;
    line-height: 18px;
    text-align: center;
    white-space: nowrap;
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.01em;
    pointer-events: none;
}

/* 小数部分按 12/16 缩小（官方 RelativeSizeSpan） */
.ton-card-amount-fraction {
    font-size: 0.75em;
}

.ton-card-amount-unit {
    margin-left: 0.28em;
    color: #5de3ff;
}

.ton-card-name {
    position: absolute;
    left: 0;
    right: 0;
    top: 79px;
    height: 12px;
    line-height: 12px;
    text-align: center;
    font-size: 12px;
    color: #5de3ff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 8px;
    pointer-events: none;
}

/* addressTop = cardRect.bottom - dp(7) - height（两行 9.3sp 等宽） */
.ton-card-address {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 7px;
    text-align: center;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 9.5px;
    line-height: 15px;
    letter-spacing: 0.01em;
    white-space: pre;
    color: #0145d0;
    /* 官方先用 6% 白在同位置画一遍再叠正文，这里用同向阴影代替 */
    text-shadow: 0 1px 0 rgb(255 255 255 / 0.1);
    pointer-events: none;
}
</style>
