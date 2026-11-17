<template>
    <!-- 资料页小卡片里的钱包缩略图：纯背景 + 余额 + 3D 钻石 + 名称 + 地址 + 银色芯片，不含贴纸 -->
    <div class="wcm" :style="rootStyle" aria-hidden="true">
        <div class="wcm-surface" :style="surfaceStyle" />
        <canvas ref="stoneEl" class="wcm-stone" :style="stoneStyle" />
        <div class="wcm-balance" :style="balanceStyle">
            <span class="wcm-amount">{{ formatted.whole }}{{ formatted.fraction }}</span>
            <span class="wcm-unit">GRAM</span>
        </div>
        <div v-if="name" class="wcm-name" :style="nameStyle">{{ name }}</div>
        <div class="wcm-chip" :style="chipStyle">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2.2" y="2.2" width="7.4" height="7.4" rx="1.6" fill="none" stroke="#5B6168" stroke-width="1.9" />
                <rect x="14.4" y="2.2" width="7.4" height="7.4" rx="1.6" fill="none" stroke="#5B6168" stroke-width="1.9" />
                <rect x="2.2" y="14.4" width="7.4" height="7.4" rx="1.6" fill="none" stroke="#5B6168" stroke-width="1.9" />
                <rect x="14.4" y="14.4" width="2.6" height="2.6" rx="0.7" fill="#5B6168" />
                <rect x="19.2" y="14.4" width="2.6" height="2.6" rx="0.7" fill="#5B6168" />
                <rect x="16.8" y="17.2" width="2.6" height="2.6" rx="0.7" fill="#5B6168" />
                <rect x="14.4" y="19.4" width="2.6" height="2.6" rx="0.7" fill="#5B6168" />
                <rect x="19.2" y="19.4" width="2.6" height="2.6" rx="0.7" fill="#5B6168" />
            </svg>
        </div>
        <div class="wcm-address" :style="addressStyle">
            <span v-for="(col, index) in addressColumns" :key="index" class="wcm-address-col"
                :style="addressColStyle(index)">{{ col }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getCardBackgroundUrl } from '../../utils/diamond/cardBackground';
import { PALETTE_ICE } from '../../utils/diamond/palette';
import { walletCardMaterialFromPalette, withAlpha } from '../../utils/wallet/walletCardMaterials';
import type { WalletCardPalette } from '../../utils/wallet/walletCard';
import { mountDiamond, type DiamondHandle } from '../../utils/diamond/stage';
import { formatGramAddress, formatGramBalance, type GramAmount } from '../../utils/message/tonTransfer';

const props = withDefaults(defineProps<{
    address: string;
    balance: GramAmount;
    name?: string;
    /** 缩略图宽度，高度按 400:243 计算 */
    width?: number;
    /** 礼物配色；不传时用官方 Gram 品牌蓝 */
    palette?: WalletCardPalette | null;
}>(), {
    name: '',
    width: 72,
    palette: null,
});

/** 统一按 400 宽的设计稿缩放 */
const scale = computed(() => props.width / 400);
const height = computed(() => Math.round(243 * scale.value));

const material = computed(() => walletCardMaterialFromPalette(props.palette));

const rootStyle = computed(() => ({
    width: props.width + 'px',
    height: height.value + 'px',
    borderRadius: 15 * scale.value + 'px',
    '--wcm-bg': material.value.background,
    '--wcm-shadow': withAlpha(material.value.edgeColor, 0.35),
    '--wcm-text': props.palette?.text ?? '#ffffff',
    '--wcm-accent': material.value.accent,
}));

const surfaceStyle = computed(() => (props.palette
    ? {
        background: 'radial-gradient(120% 150% at 34% 42%, ' + props.palette.center
            + ' 0%, ' + props.palette.edge + ' 100%)',
    }
    : {
        backgroundImage: 'url(' + getCardBackgroundUrl(props.width * 2, height.value * 2) + ')',
        backgroundSize: '100% 100%',
    }));

const formatted = computed(() => formatGramBalance(props.balance));

/** 缩略卡也渲染真正的 3D 钻石，只是画布只有 ~10px，天然低分辨率 */
const stoneEl = ref<HTMLCanvasElement | null>(null);
let diamond: DiamondHandle | null = null;
onMounted(() => {
    if (!stoneEl.value) return;
    diamond = mountDiamond({ target: stoneEl.value, palette: PALETTE_ICE, spin: false });
    diamond.setVisible(true);
});
onBeforeUnmount(() => {
    diamond?.dispose();
    diamond = null;
});

const stoneStyle = computed(() => ({
    left: 19 * scale.value + 'px',
    top: 75 * scale.value + 'px',
    width: 56 * scale.value + 'px',
    height: 56 * scale.value + 'px',
}));
const addressColumns = computed(() => formatGramAddress(props.address || '').split('\n').filter(Boolean));

const balanceStyle = computed(() => ({
    left: 69 * scale.value + 'px',
    top: 88 * scale.value + 'px',
    fontSize: 30 * scale.value + 'px',
}));

const chipStyle = computed(() => ({
    left: 289 * scale.value + 'px',
    top: 88 * scale.value + 'px',
    width: 56 * scale.value + 'px',
    height: 42 * scale.value + 'px',
    borderRadius: 8 * scale.value + 'px',
}));

const nameStyle = computed(() => ({
    left: 30 * scale.value + 'px',
    bottom: 18 * scale.value + 'px',
    fontSize: 14 * scale.value + 'px',
    letterSpacing: -0.02 * scale.value + 'em',
}));

const addressStyle = computed(() => ({
    right: 6 * scale.value + 'px',
    top: 10 * scale.value + 'px',
    fontSize: 10 * scale.value + 'px',
    letterSpacing: 1.2 * scale.value + 'px',
    lineHeight: 10 * scale.value + 'px',
}));

function addressColStyle(index: number) {
    return {
        left: (index * 10 * scale.value) + 'px',
    };
}
</script>

<style scoped>
.wcm {
    position: relative;
    overflow: hidden;
    flex: none;
    background: var(--wcm-bg, #0a72d8);
    box-shadow:
        0 2px 6px var(--wcm-shadow, rgb(0 30 60 / 0.35)),
        inset 0 1px 0 rgb(255 255 255 / 0.2);
    user-select: none;
}

.wcm-surface {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.wcm-stone {
    position: absolute;
}

.wcm-balance {
    position: absolute;
    display: flex;
    align-items: baseline;
    gap: 0.18em;
    color: var(--wcm-text, #fff);
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
}

.wcm-amount {
    font-variant-numeric: tabular-nums;
}

.wcm-unit {
    font-size: 0.9em;
    font-weight: 500;
    color: var(--wcm-accent, #b9f2ff);
    transform: scaleX(0.88);
    transform-origin: left center;
}

.wcm-name {
    position: absolute;
    color: var(--wcm-text, #fff);
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
}

.wcm-chip {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(160deg, #fbfcfd 0%, #dfe3e8 38%, #f4f6f8 58%, #c9ced5 100%);
    border: 1px solid #b9bec6;
    box-shadow: 0 1px 2px rgb(0 20 40 / 0.25);
}

.wcm-chip svg {
    width: 46%;
    height: 46%;
    display: block;
}

.wcm-address {
    position: absolute;
    top: 10px;
    right: 0;
    width: 0;
    height: 0;
    color: rgb(255 255 255 / 0.55);
    font-weight: 500;
    white-space: nowrap;
}

.wcm-address-col {
    position: absolute;
    top: 0;
    transform: rotate(90deg);
    transform-origin: top left;
}
</style>
