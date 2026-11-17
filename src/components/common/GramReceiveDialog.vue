<template>
    <Teleport to="body">
        <Transition name="gr-receive">
            <!-- 收款弹窗：蓝色面板 + 白底卡片（二维码 + 复制按钮），卡片四周的地址带沿圆角矩形路径绕圈 -->
            <div v-if="open" class="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" aria-labelledby="gram-receive-about" @mousedown.self="emitClose">
                <div
                    class="gr-panel relative max-w-[calc(100vw-2rem)] rounded-[26px] px-8 pt-10 pb-5 shadow-2xl"
                    :style="panelStyle">
                    <!-- 关闭：右上角白色 ×，压在二维码区域之外 -->
                    <button type="button" :aria-label="t('lng_close')"
                        class="absolute top-2.5 right-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/20"
                        @click="emitClose">
                        <XIcon class="h-4.5 w-4.5" />
                    </button>

                    <!-- 舞台比白色卡片大一圈：地址带沿圆角矩形路径走，字形只落在路径上 -->
                    <div ref="stageEl" class="gr-stage relative mx-auto" :style="stageStyle">
                        <span v-for="(glyph, index) in glyphs" :key="index" class="gr-glyph"
                            :style="glyphStyles[index]">{{ glyph.char }}</span>

                        <!-- 白色卡片：二维码 + 下方「复制地址」。按钮在卡片里，卡片四周就是二维码四周 -->
                        <div class="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-between rounded-[18px] bg-white shadow-[0_6px_20px_-12px_rgb(0_32_74/0.4)]"
                            :style="cardStyle">
                            <div class="relative">
                                <div ref="qrHost" class="gr-qr" :style="qrStyle" />
                                <!-- 中央 3D 钻石：渲染器和钱包卡片共用同一套（白色圆盘留白由二维码自己挖出来） -->
                                <div class="gr-logo absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                                    :style="logoStyle">
                                    <!-- 按住放大、拖动改朝向，和转账气泡/钱包卡片同一套手感 -->
                                    <canvas ref="stoneEl" class="gr-stone block h-full w-full" aria-hidden="true"
                                        @pointerdown="onStonePointerDown" @pointermove="onStonePointerMove"
                                        @pointerup="onStonePointerUp" @pointercancel="onStonePointerUp"
                                        @contextmenu.prevent />
                                </div>
                            </div>

                            <!-- 复制地址：主题浅色（品牌色的浅色调底 + 品牌色文字），跟着主题色一起变 -->
                            <button type="button"
                                class="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--app-brand-soft)] px-4 py-2 text-sm font-medium text-[var(--app-brand)] transition-opacity hover:opacity-80"
                                @click="copyAddress">
                                <CopyIcon class="h-4 w-4" />
                                <span>{{ t('walletReceive.copyAddress') }}</span>
                            </button>
                        </div>
                    </div>

                    <!-- 说明：换行由宽度决定，与官方弹窗一致 -->
                    <p id="gram-receive-about" class="mt-4 text-center text-sm leading-snug text-white/95">
                        {{ aboutText }}
                    </p>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CopyIcon, XIcon } from 'lucide-vue-next';
import QRCodeStyling from 'qr-code-styling';
import { useDiamondDrag } from '../../composables/useDiamondDrag';
import { PALETTE_BLUE } from '../../utils/diamond/palette';
import { toast } from '../../utils/ui/toast';
import { ringCellWidth, ringGlyphs, ringRepeatCount, roundedRingPath } from '../../utils/wallet/ringText';

const props = withDefaults(defineProps<{
    open: boolean;
    /** TON 地址（48 字符 base64url，TDLib `tonWalletCard.address`） */
    address: string;
}>(), {
    address: '',
});

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

/** 二维码边长：白色卡片的内宽，卡片和舞台的尺度都由它推出来 */
const QR_SIDE = 232;
/** 卡片内边距：二维码四周的白色静区，四边等宽 */
const CARD_PADDING = 18;
/** 「复制地址」按钮高度（py-2 + text-sm 行高） */
const COPY_HEIGHT = 36;
/** 二维码与按钮之间的间距 */
const COPY_GAP = 12;
/** 卡片宽 = 二维码 + 左右内边距 */
const CARD_WIDTH = QR_SIDE + CARD_PADDING * 2;
/** 卡片高 = 上下内边距 + 二维码 + 间距 + 按钮（二维码在上，按钮贴下） */
const CARD_HEIGHT = CARD_PADDING * 2 + QR_SIDE + COPY_GAP + COPY_HEIGHT;
/** 卡片到地址带的间距：到卡片 14px，字身高约 10px，四边贴边留白约 7px */
const RING_GAP = 20;
/** 舞台比卡片大一圈，地址带绕着卡片走：横竖各自等距，四边留白都是 14px */
const STAGE_WIDTH = CARD_WIDTH + RING_GAP * 2;
const STAGE_HEIGHT = CARD_HEIGHT + RING_GAP * 2;
/** 路径四边内缩：字形以自身中心落在路径上，留出半个字身 */
const RING_INSET = 6;
/** 路径圆角 = 卡片圆角 18 + 到卡片间距 14：圆角同心，四个角的留白才不会比直边大 */
const RING_RADIUS = 32;
/** 面板左右内边距（对应 px-8）。面板宽度按舞台算，不再是固定 460px */
const PANEL_PADDING_X = 32;
/** 中央 3D 钻石的画布边长（CSS px）：石头本体约占画布 2/3（~42px），画布比留白大一圈才显得饱满 */
const LOGO_SIZE = 68;
/** 二维码中央挖掉的白色圆盘：按石头本体的轮廓留边（左右各约 10px），又不浪费纠错余量 */
const LOGO_HOLE = 62;
/** imageSize 是相对二维码边长的比例 */
const LOGO_IMAGE_RATIO = LOGO_HOLE / QR_SIDE;
/** 画布整体上提（px）：抵消石头模型自带的底部留白（随画布尺寸等比缩放） */
const LOGO_LIFT = 3 * (LOGO_SIZE / 96);
/** 走完一圈要多久：和 Telegram Desktop 一样慢，快了会读成「加载中」 */
const LAP_MS = 30000;

const stageEl = ref<HTMLElement | null>(null);
const qrHost = ref<HTMLElement | null>(null);
const stoneEl = ref<HTMLCanvasElement | null>(null);
let qr: QRCodeStyling | null = null;
/** 当前实例绑定的宿主节点：v-if 关掉再打开时宿主是新的元素，旧实例不能复用 */
let qrBoundHost: HTMLElement | null = null;
/** 画布还没量到尺寸时的重试次数 */
let stoneRetries = 0;

/** 面板宽度 = 舞台 + 左右内边距：宽度只由内容决定，不再比内容宽一大截 */
const panelStyle = computed(() => ({
    width: STAGE_WIDTH + PANEL_PADDING_X * 2 + 'px',
}));

const stageStyle = computed(() => ({
    width: STAGE_WIDTH + 'px',
    height: STAGE_HEIGHT + 'px',
    '--gr-ring-font': ringFontSize.value.toFixed(2) + 'px',
}));

const cardStyle = computed(() => ({
    width: CARD_WIDTH + 'px',
    height: CARD_HEIGHT + 'px',
    padding: CARD_PADDING + 'px',
}));

const qrStyle = computed(() => ({
    width: QR_SIDE + 'px',
    height: QR_SIDE + 'px',
}));

const logoStyle = computed(() => ({
    width: LOGO_SIZE + 'px',
    height: LOGO_SIZE + 'px',
    // 石头模型在画布里略偏下（底座占了高度），上提一点才在留白里居中
    marginTop: -LOGO_LIFT + 'px',
}));

const aboutText = computed(() => t('walletReceive.about'));

/** 二维码内容：与 Telegram Desktop 的分享弹窗一致，用可转账的 ton:// 链接 */
const qrData = computed(() => (props.address ? 'ton://transfer/' + props.address : ''));

/** 环形路径：几何全部由 ringText 计算，组件只负责摆放 */
const ringPath = computed(() => roundedRingPath(STAGE_WIDTH, STAGE_HEIGHT, RING_RADIUS, RING_INSET));

/** 沿周长重复几遍：按字重均分周长，重复次数决定字距 */
const repeatCount = computed(() => ringRepeatCount(ringPath.value.length, props.address));

/** 每个字形沿周长的比例（0~1） */
const glyphs = computed(() => ringGlyphs(props.address, repeatCount.value));

/**
 * 字号跟着格子走：一个字符正好落进一格，字距才不会一会儿稀一会儿挤。
 * 等宽字体的前进宽度约 0.58em，格子宽由 ringText 按实际字符数算出。
 */
const ringFontSize = computed(() => {
    const cell = ringCellWidth(ringPath.value.length, props.address, repeatCount.value);
    if (!cell) return 12;
    return Math.max(9, Math.min(14, cell / 0.58));
});

/** 静态摆位（也是动画的第一帧）：真正转起来时由 rAF 直接写 transform */
const glyphStyles = computed(() => glyphs.value.map((glyph) => glyphStyleAt(glyph.fraction)));

function glyphStyleAt(fraction: number): Record<string, string> {
    const pose = ringPath.value.evaluate(fraction * ringPath.value.length);
    return {
        transform: 'translate(' + pose.x.toFixed(2) + 'px, ' + pose.y.toFixed(2) + 'px)'
            + ' rotate(' + pose.angle.toFixed(4) + 'rad) translate(-50%, -50%)',
    };
}

// ---------- 绕圈动画 ----------
let rafId = 0;
let lapStart = 0;
let running = false;

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 把整条带整体前移一个进度：每个字形只是在自己那一格上加同一个偏移 */
function paint(progress: number) {
    const host = stageEl.value;
    if (!host) return;
    const nodes = host.querySelectorAll<HTMLElement>('.gr-glyph');
    const length = ringPath.value.length;
    const total = glyphs.value.length;
    if (!total || nodes.length !== total) return;
    for (let index = 0; index < total; index += 1) {
        const fraction = ((glyphs.value[index].fraction + progress) % 1 + 1) % 1;
        const pose = ringPath.value.evaluate(fraction * length);
        nodes[index].style.transform = 'translate(' + pose.x.toFixed(2) + 'px, ' + pose.y.toFixed(2)
            + 'px) rotate(' + pose.angle.toFixed(4) + 'rad) translate(-50%, -50%)';
    }
}

function tick(timestamp: number) {
    if (!running) return;
    if (!lapStart) lapStart = timestamp;
    paint(((timestamp - lapStart) % LAP_MS) / LAP_MS);
    rafId = window.requestAnimationFrame(tick);
}

function startRing() {
    stopRing();
    if (prefersReducedMotion() || !glyphs.value.length) return;
    running = true;
    lapStart = 0;
    rafId = window.requestAnimationFrame(tick);
}

function stopRing() {
    running = false;
    if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
    }
}

// ---------- 二维码 ----------
/**
 * 二维码中央的留白圆盘（内联 SVG，免得多打包一张图）。
 * 只是给 3D 钻石让出的白底：码点由 hideBackgroundDots 挖掉，石头画在上面的画布上。
 */
const QR_LOGO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
    + '<circle cx="24" cy="24" r="24" fill="#ffffff"/>'
    + '</svg>',
);

/** 在给定宿主上新建实例并画出第一版，实例与宿主绑在一起 */
function createQr(host: HTMLElement) {
    const side = QR_SIDE;
    qr = new QRCodeStyling({
        width: side,
        height: side,
        type: 'svg',
        data: qrData.value,
        margin: 0,
        qrOptions: { errorCorrectionLevel: 'H' },
        dotsOptions: { color: '#0b0b0b', type: 'rounded' },
        backgroundOptions: { color: '#ffffff' },
        cornersSquareOptions: { type: 'extra-rounded', color: '#0b0b0b' },
        cornersDotOptions: { type: 'dot', color: '#0b0b0b' },
        imageOptions: {
            imageSize: LOGO_IMAGE_RATIO,
            margin: 0,
            hideBackgroundDots: true,
            crossOrigin: 'anonymous',
        },
        image: QR_LOGO,
    });
    host.innerHTML = '';
    qr.append(host);
    qrBoundHost = host;
}

function renderQr() {
    const host = qrHost.value;
    if (!host || !qrData.value) return;
    const side = QR_SIDE;
    // 关掉再打开时 v-if 重新建了一棵 DOM，宿主是新节点；而实例只认 append 时给的那个节点，
    // update() 也只会画进那里 —— 于是新宿主永远是空的（第一次能显示、第二次整块空白）。
    // 宿主变了就丢掉旧实例重建。
    if (qr && qrBoundHost !== host) {
        qr = null;
        qrBoundHost = null;
    }
    if (!qr) {
        createQr(host);
        return;
    }
    qr.update({ data: qrData.value, width: side, height: side });
    // 兜底：万一内容没落进当前宿主（宿主被换掉而实例还在），重建一次保证画出来
    if (!host.firstChild) {
        qr = null;
        createQr(host);
    }
}

// ---------- 中央 3D 钻石 ----------
/**
 * 复用转账气泡那套手势：按住放大、拖动改朝向、松手回弹。
 * 弹窗没有滚动容器，不需要视口门控；放大倍数与样式里 .is-diamond-pressed 的 scale 一致。
 */
const {
    mount: mountStone3D,
    unmount: unmountStone3D,
    onPointerDown: onStonePointerDown,
    onPointerMove: onStonePointerMove,
    onPointerUp: onStonePointerUp,
} = useDiamondDrag({
    canvas: stoneEl,
    palette: PALETTE_BLUE,
    viewportGate: false,
    pressZoom: true,
    // 按住放大 2.5 倍：石头 42px → 约 105px，会压到一部分码点（临时效果，松手即恢复）
    pressScale: 2.5,
    spin: true,
});

/**
 * 挂上钻石。画布尺寸由 CSS 给定，渲染器按显示尺寸开自己的 2D 画布；
 * 布局还没量到尺寸时（弹窗刚打开）留空，石头下一帧再来。
 */
function mountStone() {
    const canvas = stoneEl.value;
    if (!canvas) return;
    // 刚插进 DOM 时可能还没排版（拿到的宽度是 0）：下一帧再量一次，最多试几帧
    if (canvas.getBoundingClientRect().width < 8) {
        if (stoneRetries < 3) {
            stoneRetries += 1;
            window.requestAnimationFrame(mountStone);
        }
        return;
    }
    stoneRetries = 0;
    mountStone3D();
}

function unmountStone() {
    stoneRetries = 0;
    unmountStone3D();
}

// ---------- 复制地址 ----------
async function copyAddress() {
    const value = props.address?.trim();
    if (!value) return;
    try {
        await navigator.clipboard.writeText(value);
        toast.success(t('walletReceive.addressCopied'));
    } catch {
        // 剪贴板不可用（无权限 / 非安全上下文）：不做视觉反馈，也不弹错误
    }
}

function emitClose() {
    emit('close');
}

function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !props.open) return;
    // 弹窗盖在钱包卡片上：Esc 先归弹窗。标记一下，让外层监听者知道这次按键已被消费，
    // 否则同一个 Esc 会被依次当成「关弹窗」和「关卡片」
    event.preventDefault();
    emitClose();
}

watch(() => props.open, async (open) => {
    if (!open) {
        stopRing();
        // 关闭时 DOM 被 v-if 卸掉：句柄里的画布已经不在了，必须注销，否则渲染器还在画
        unmountStone();
        // 二维码实例绑着被卸掉的宿主，一并释放，下次打开按新宿主重建
        qr = null;
        qrBoundHost = null;
        return;
    }
    await nextTick();
    renderQr();
    startRing();
    mountStone();
}, { immediate: true });

watch(() => props.address, async () => {
    if (!props.open) return;
    await nextTick();
    renderQr();
    startRing();
});

onMounted(() => {
    window.addEventListener('keydown', onKeydown);
    // 弹窗一挂载就是打开态时，watch 的 immediate 分支跑在 setup 阶段、DOM 还没挂上；
    // 这里再补一次，二维码不依赖 watch 的时序
    if (props.open) {
        renderQr();
        startRing();
        mountStone();
    }
});
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    stopRing();
    unmountStone();
    qr = null;
    qrBoundHost = null;
});
</script>

<style scoped>
/* 面板底色：与 Gram 品牌蓝同一套渐变，顶部略亮 */
.gr-panel {
    background: linear-gradient(168deg, #3aa5f6 0%, #1086e4 100%);
    box-shadow: 0 30px 60px -24px rgb(0 24 56 / 0.65);
}

.gr-stage {
    position: relative;
    flex: none;
}

/*
 * 地址带：等宽字体，每个字一格，透明度压低成水印，不抢二维码。
 * transform-origin 必须是 0 0：rotate 之后再 translate(-50%,-50%) 才是「以字身中心
 * 落在路径上」；origin 留在 center 时，百分比位移会被 origin 变换再折算一次，
 * 四边的字形各偏出一个跟角度相关的量（右/下偏得最多），贴边间距就不等了。
 */
.gr-glyph {
    position: absolute;
    top: 0;
    left: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--gr-ring-font, 12px);
    line-height: 1;
    letter-spacing: 0;
    white-space: pre;
    color: rgb(255 255 255 / 0.42);
    transform-origin: 0 0;
    will-change: transform;
    pointer-events: none;
    user-select: none;
}

.gr-qr :deep(svg) {
    display: block;
    width: 100%;
    height: 100%;
}

/*
 * 钻石画布：透明底，只盖住二维码中央的留白。
 * 按住放大走 CSS transform（与 pressScale 一致），渲染器同步补像素，放大后不发糊。
 */
.gr-stone {
    touch-action: none;
    cursor: grab;
    transform-origin: 50% 50%;
    transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.gr-stone:hover {
    cursor: grab;
}

.gr-stone.is-diamond-pressed {
    cursor: grabbing;
    transform: scale(2.5);
}


/* 进出：轻微放大 + 淡入，和资料页其它弹窗同一套节奏 */
.gr-receive-enter-active,
.gr-receive-leave-active {
    transition: opacity 180ms ease-out;
}

.gr-receive-enter-active .gr-panel,
.gr-receive-leave-active .gr-panel {
    transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms ease-out;
}

.gr-receive-enter-from,
.gr-receive-leave-to {
    opacity: 0;
}

.gr-receive-enter-from .gr-panel,
.gr-receive-leave-to .gr-panel {
    transform: scale(0.94);
    opacity: 0;
}
</style>
