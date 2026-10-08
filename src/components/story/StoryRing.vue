<template>
    <span v-if="state" class="story-ring" :class="{ 'story-ring--clickable': clickable }" :style="ringStyle"
        @click.stop="onClick" :title="title">
        <slot />
    </span>
    <span v-else class="story-ring story-ring--none" :style="plainStyle">
        <slot />
    </span>
</template>

<script setup lang="ts">
import { computed, ref, useAttrs, watch } from "vue";
import {
    getChatStoryState,
    getUserStoryState,
    getUserChatId,
    resolveUserChatId,
    openChatStories,
    type ChatStoryState,
} from "../../store/storyRing";
import { useColors } from "../../store/colors";

/**
 * 动态（Story）渐变描边容器：包住头像（<Avatar> 或 <img>），在外圈画一圈渐变描边，
 * 描边与头像之间留出空隙（空隙是真正透明的，露出所在表面的背景，不是拿底色假装）。
 *
 * 配色（与 Unigram ActiveStoriesSegments 同源，可用用户 accent 的 story_colors 覆盖）：
 *   - 未读：绿 → 蓝渐变
 *   - 已查看：灰（透明度 30%）—— 看过后颜色变化
 *   - 直播：红
 *
 * 几何（与 Unigram 一致）：外径恒定，有动态时头像向内收缩，
 * 收缩量 = 描边 + 空隙（Unigram 为 side - 8）。
 * 描边用 mask 只保留外圈 padding 带，因此中间是透明的；圆角对正圆和圆角方形都成立。
 * 尺寸由调用方决定：给 `diameter` 或 w-/h- class。
 */
const props = withDefaults(
    defineProps<{
        /** 对话 id（动态状态与打开播放器都以 chat 为单位） */
        chatId?: number;
        /** 用户 id（个人资料页场景；与 chatId 二选一） */
        userId?: number;
        /** 头像尺寸（px）：用于计算描边/空隙与内层圆角 */
        size?: number;
        /** 固定外径（px）：填满父容器时不传；需要独立尺寸（如标题栏叠加）时传 */
        diameter?: number;
        /**
         * 内层头像的 border-radius 百分比（0~50；不传 = 50 正圆）。
         * 必须与头像自身圆角一致，环按同心圆收窄算出外层圆角，空隙才会均匀。
         */
        radiusPercent?: number;
        /** 图标/头像是否可点击打开动态，默认 true */
        clickable?: boolean;
    }>(),
    { chatId: undefined, userId: undefined, size: 48, diameter: undefined, radiusPercent: undefined, clickable: true },
);

const attrs = useAttrs();
const { storyRingGradientFor } = useColors();

/** userId 场景解析出的 chat_id（用于打开播放器与标记已读） */
const resolvedChatId = ref<number | undefined>(undefined);

watch(
    () => props.userId,
    (uid) => {
        resolvedChatId.value = uid ? getUserChatId(uid) : undefined;
        if (uid && !resolvedChatId.value) void resolveUserChatId(uid).then((id) => (resolvedChatId.value = id));
    },
    { immediate: true },
);

const state = computed<ChatStoryState | null>(() => {
    if (props.chatId) return getChatStoryState(props.chatId);
    if (props.userId) return getUserStoryState(props.userId);
    return null;
});

const accentId = computed(() => {
    const v = attrs.accentColorId;
    return typeof v === "number" ? v : undefined;
});

/** 描边粗细（px）：小尺寸用更细的线 */
const stroke = computed(() => (props.size <= 24 ? 1.5 : 2));

/** 描边与头像之间的空隙（px） */
const gap = computed(() => (props.size <= 24 ? 1.5 : 2));

/** 一圈内缩量（描边 + 空隙） */
const inset = computed(() => stroke.value + gap.value);

/** 被包裹头像的边长（px） */
const innerPx = computed(() => (props.diameter ?? props.size ?? 48) - inset.value * 2);

/**
 * 外层圆角：
 * - 正圆直接用 50%（mask 裁出的内圈按同比例缩小，天然与头像同心）
 * - 圆角方形按同心圆反推：头像圆角(px) + 内缩 = 外层圆角，
 *   这样 mask 的 content-box 内圈（= 外层圆角 - 内缩）正好等于头像圆角，空隙均匀。
 */
const radiusCss = computed(() => {
    const pct = props.radiusPercent;
    if (pct === undefined || pct >= 50) return "50%";
    const innerR = (Math.max(0, pct) / 100) * innerPx.value;
    return `${innerR + inset.value}px`;
});

function sizeStyle(style: Record<string, string>) {
    if (props.diameter !== undefined) {
        style.width = `${props.diameter}px`;
        style.height = `${props.diameter}px`;
    }
    return style;
}

const ringStyle = computed<Record<string, string>>(() =>
    sizeStyle({
        "--story-stroke": `${stroke.value}px`,
        "--story-ring-bg": storyRingGradientFor(state.value!.unread, state.value!.live, accentId.value),
        // 头像内缩 = 描边 + 空隙，露出透明空隙
        padding: `${stroke.value + gap.value}px`,
        borderRadius: radiusCss.value,
    }),
);

const plainStyle = computed<Record<string, string>>(() =>
    sizeStyle({ borderRadius: radiusCss.value }),
);

const clickable = computed(() => props.clickable && !!state.value);

const title = computed(() => (state.value ? "Story" : ""));

function onClick() {
    if (!clickable.value) return;
    void openChatStories(props.chatId ?? resolvedChatId.value, 0, props.userId);
}
</script>

<style scoped>
.story-ring {
    position: relative;
    /* 尺寸由调用方给（diameter 或 w-/h- class），避免依赖父容器百分比导致被内容撑开 */
    display: inline-flex;
    flex-shrink: 0;
    box-sizing: border-box;
}

/*
 * 渐变描边：铺满整块，再用 mask 挖掉 content-box（即内缩 stroke 之后的区域），
 * 于是只剩外圈 stroke 宽的一圈渐变，中间保持透明。
 * 对正圆（50%）和圆角方形（px）同样成立。
 */
.story-ring::before {
    content: "";
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    border-radius: inherit;
    padding: var(--story-stroke, 2px);
    background: var(--story-ring-bg);
    pointer-events: none;
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
}

.story-ring--clickable {
    cursor: pointer;
}

/* 无动态：不占空隙、不画环，头像保持原尺寸 */
.story-ring--none {
    padding: 0;
}

.story-ring--none::before {
    display: none;
}

.story-ring > :deep(*) {
    width: 100%;
    height: 100%;
}
</style>
