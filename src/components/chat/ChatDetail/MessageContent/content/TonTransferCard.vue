<template>
    <!-- Gram 转账卡片：尺寸与排版对齐 Telegram Android 的 WalletActionLayout
         （卡片 220×148dp、圆角 16dp、钻石放大到 56dp 位于顶部 +6dp、金额顶边 +66dp、
         地址底边 -7dp），背景是程序化生成的八阶光场，不引用任何位图资产。 -->
    <!-- 钻石放在裁剪盒（.ton-card）外面：卡片需要 overflow:hidden 裁缎带外角，
         但按压放大的石头必须能溢出卡片边界显示，所以它挂在不会裁剪的外层上 -->
    <div ref="hostEl" class="ton-card-host" @pointermove="onSheenMove" @pointerleave="resetSheen">
        <!-- 整块蓝色卡面就是「交易详情」的入口：点卡面开弹窗。
             钻石是卡面的兄弟节点且盖在上面，按压 / 拖拽石头不会触发这里的 click -->
        <div class="ton-card" :style="cardStyle" role="button" tabindex="0"
            @click="emit('details')" @keydown.enter.prevent="emit('details')" @keydown.space.prevent="emit('details')">
            <div class="ton-card-sheen" :style="sheenStyle" />

            <!-- 右上角斜切缎带：GiftSheet.RibbonDrawable 的 48×48 贝塞尔原值，
                 被卡片 16dp 圆角裁掉外角，所以它永远不会把卡角顶成直角 -->
            <svg class="ton-card-ribbon" viewBox="0 0 48 48" aria-hidden="true">
                <path :d="RIBBON_PATH" :fill="ribbonColor" />
                <text class="ton-card-ribbon-label" x="30" y="18" transform="rotate(45 30 18)"
                    :style="{ fontSize: `${ribbonFontSize}px` }">{{ label }}</text>
            </svg>

            <div class="ton-card-amount">
                <span class="ton-card-amount-number">{{ amount.sign }}{{ amount.whole }}<span
                        class="ton-card-amount-fraction">{{ amount.fraction }}</span></span>
                <span class="ton-card-amount-unit">{{ t('lng_action_gram_transfer_ticker', 1) }}</span>
            </div>

            <div class="ton-card-name">{{ name }}</div>

            <div class="ton-card-address">{{ addressText }}</div>
        </div>

        <!-- 钻石：单例 WebGL 上下文离屏渲染后逐帧贴到这块画布上 -->
        <canvas ref="stoneEl" class="ton-card-stone" @pointerdown="onPointerDown"
            @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
            @lostpointercapture="onPointerUp" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getCardBackgroundUrl } from '../../../../../utils/diamond/cardBackground';
import { useDiamondDrag } from '../../../../../composables/useDiamondDrag';
import {
    formatGramAddress,
    formatGramAmount,
    TON_CARD_HEIGHT,
    TON_CARD_RADIUS,
    TON_CARD_WIDTH,
    TON_RIBBON_COLORS,
    type GramAmount,
    type TonTransferStatus,
} from '../../../../../utils/message/tonTransfer';

const { t } = useI18n();

/** 底色位图的生成倍率：平滑光场 2× 足够，再高只是白白多算一遍 */
const BACKGROUND_SCALE = 2;

/** GiftSheet.RibbonDrawable.fillRibbonPath 的原始路径（48×48 坐标系） */
const RIBBON_PATH = 'M46.83 24.5 L23.5 1.17 C22.75 .42 21.73 0 20.68 0 '
    + 'C19.62 0 2.73 .05 1.55 .05 C.36 .05 -.23 1.4885 .6 2.32 '
    + 'L45.72 47.44 C46.56 48.28 48 47.68 48 46.5 L48 27.32 C48 26.26 47.5 25.24 46.82 24.5 Z';

const props = defineProps<{
    /** 最小单位的有符号金额（负数出账；1.8.70 起 TDLib 传字符串） */
    amount: GramAmount;
    /** TON 地址（48 字符 base64url） */
    address: string;
    /** 对方显示名 */
    name: string;
    /** 缎带状态 */
    status: TonTransferStatus;
    /** 缎带文案（已本地化） */
    label: string;
    /** 消息由自己发出：金额强制显示负号 */
    outgoing?: boolean;
}>();

const emit = defineEmits<{
    /** 点击蓝色卡面：打开交易详情弹窗 */
    details: [];
}>();

const stoneEl = ref<HTMLCanvasElement | null>(null);

/** 按压放大 + 拖拽：与交易详情弹窗共用同一套交互（卡片小，放大上限收到 2.2×） */
const {
    mount: mountStone,
    invalidate: invalidateStone,
    onPointerDown,
    onPointerMove,
    onPointerUp,
} = useDiamondDrag({ canvas: stoneEl, viewportGate: true });

const amount = computed(() => formatGramAmount(props.amount, props.outgoing === true));
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

/** 光影跟随鼠标的最大倾角（度）：.ton-card-sheen 用 1.22 倍铺底，±8° 内四角不会露空 */
const SHEEN_MAX_TILT = 8;

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const hostEl = ref<HTMLElement | null>(null);
/** 当前写进 CSS 变量的倾角，用来滤掉亚度级抖动，避免每次 pointermove 都动样式 */
let sheenAngle = 0;
const reduceMotion = prefersReducedMotion();

/**
 * 鼠标在卡片上移动时，把黑胶光场绕着卡片中心轻微转一点：
 * 越靠右顺时针、越靠左逆时针，鼠标离开时回正（CSS transition 负责平滑）。
 */
function onSheenMove(event: PointerEvent) {
    const host = hostEl.value;
    if (!host || reduceMotion) return;
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0) return;
    const offset = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const angle = Math.max(-1, Math.min(1, offset)) * SHEEN_MAX_TILT;
    if (Math.abs(angle - sheenAngle) < 0.4) return;
    sheenAngle = angle;
    host.style.setProperty('--sheen-rotate', `${angle.toFixed(2)}deg`);
}

function resetSheen() {
    const host = hostEl.value;
    if (!host || sheenAngle === 0) return;
    sheenAngle = 0;
    host.style.setProperty('--sheen-rotate', '0deg');
}

onMounted(mountStone);

watch(() => props.amount, invalidateStone);
</script>

<style scoped>
/* 不裁剪的外层：卡片本身要裁缎带外角，石头要能溢出，只能分成两层 */
.ton-card-host {
    position: relative;
    flex: none;
}

.ton-card {
    position: relative;
    overflow: hidden;
    flex: none;
    isolation: isolate;
    cursor: pointer;
}

/* 键盘可达：卡面是「交易详情」的入口，聚焦时给一圈贴边的白描边（蓝底上最清楚） */
.ton-card:focus-visible {
    outline: 2px solid rgb(255 255 255 / 0.9);
    outline-offset: 2px;
}

.ton-card-sheen {
    position: absolute;
    inset: 0;
    background-position: center;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    pointer-events: none;
    /* 跟随鼠标轻微旋转：先放大 1.22 倍铺底，±8° 内四角不会被卡片圆角裁出空隙 */
    transform: scale(1.22) rotate(var(--sheen-rotate, 0deg));
    transition: transform 140ms ease-out;
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

/* iconSize dp(56)，restingTop = cardRect.top + dp(6) */
.ton-card-stone {
    position: absolute;
    left: 50%;
    top: 6px;
    width: 56px;
    height: 56px;
    margin-left: -28px;
    cursor: grab;
    touch-action: none;
    user-select: none;
    /* 按压缩放只切 class，缩放交给合成器：不依赖渲染循环，掉帧也照样放大 */
    transition: transform 170ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* 官方 3× 会盖住整张卡，聊天里收在 2.2×（与交易详情弹窗一致） */
.ton-card-stone.is-diamond-pressed {
    transform: scale(2.2);
}

.ton-card-stone:active {
    cursor: grabbing;
}

/* amountCenterY = cardRect.top + dp(66) + height/2（16sp 行高约 18dp） */
.ton-card-amount {
    position: absolute;
    left: 0;
    right: 0;
    top: 66px;
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

/* 名字下移 2px 贴近地址：与地址首行的盒间距由 11px 收到 7px */
.ton-card-name {
    position: absolute;
    left: 0;
    right: 0;
    top: 90px;
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

/* addressTop = cardRect.bottom - dp(7) - height（两行 11px 等宽，行高 16px） */
.ton-card-address {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 7px;
    text-align: center;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 11px;
    line-height: 16px;
    letter-spacing: 0.01em;
    white-space: pre;
    color: #0145d0;
    /* 官方先用 6% 白在同位置画一遍再叠正文，这里用同向阴影代替 */
    text-shadow: 0 1px 0 rgb(255 255 255 / 0.1);
    pointer-events: none;
}
</style>
