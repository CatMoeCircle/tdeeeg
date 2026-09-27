<template>
    <span ref="rootEl" class="reac-anim flex items-center justify-center w-full h-full overflow-hidden select-none"
        :title="emoji">
        <!-- 动态反应动画（对齐 Unigram：getEmojiReaction → select/activate animation）；
             进入视口播一次，离开视口暂停，再次回到视口从头重播 -->
        <TgsPlayer v-if="state.ready && state.format === 'tgs' && state.tgsSrc" ref="tgsRef" :src="state.tgsSrc"
            :loop="false" :autoplay="false" :size="mediaSize" class="reac-anim-media" />
        <video v-else-if="state.ready && (state.format === 'webm' || state.format === 'mpeg4') && state.src"
            ref="videoRef" :src="state.src" muted playsinline class="reac-anim-media object-contain"
            :style="mediaBoxStyle" />
        <img v-else-if="state.ready && state.format === 'webp' && state.src" :src="state.src" draggable="false"
            class="reac-anim-media object-contain" :style="mediaBoxStyle" />
        <!-- 加载失败 / 未就绪：静态 emoji 兜底 -->
        <span v-else class="leading-none" :style="{ fontSize: fallbackFontSize + 'px', lineHeight: '1' }">{{ emoji }}</span>
    </span>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import TgsPlayer, { type TgsPlayerInstance } from './TgsPlayer.vue';
import { onVisibilityChange, unobserveVisibility } from '../../composables/useSharedIntersectionObserver';
import { useEmojiReactionAnim } from '../../store/emojiReactions';

const props = withDefaults(defineProps<{
    /** reactionTypeEmoji 的 emoji 文本 */
    emoji: string;
    /** 显示边长（媒体）；省略则填满父容器 */
    size?: number;
    /** 静态兜底字号；默认随 size 略缩 */
    fallbackFont?: number;
}>(), {
    size: undefined,
    fallbackFont: undefined,
});

// v-for :key 保证实例与 emoji 一一对应，setup 时取一次缓存即可
const state = useEmojiReactionAnim(props.emoji);

const rootEl = ref<HTMLElement | null>(null);
const tgsRef = ref<TgsPlayerInstance | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
/** 当前是否在视口内（共享 IntersectionObserver） */
const inView = ref(false);

const mediaSize = computed(() => props.size);
const mediaBoxStyle = computed(() =>
    props.size != null
        ? { width: `${props.size}px`, height: `${props.size}px` }
        : { width: '100%', height: '100%' },
);
const fallbackFontSize = computed(() =>
    props.fallbackFont ?? (props.size != null ? Math.max(12, props.size - 2) : 18),
);

function isTgs(): boolean {
    return state.ready && state.format === 'tgs';
}

function isVideo(): boolean {
    return state.ready && (state.format === 'webm' || state.format === 'mpeg4');
}

/** 从头播一次（仅视口内生效） */
function playOnce() {
    if (!inView.value) return;
    if (isTgs()) {
        try {
            tgsRef.value?.stop?.();
            tgsRef.value?.seek?.(0);
            tgsRef.value?.play?.();
        } catch { /* ignore */ }
    } else if (isVideo()) {
        const v = videoRef.value;
        if (!v) return;
        try {
            v.currentTime = 0;
            void v.play().catch(() => { /* 自动播放拦截，静默 */ });
        } catch { /* ignore */ }
    }
}

/** 暂停（离开视口 / 卸载） */
function pauseAnim() {
    if (isTgs()) {
        try { tgsRef.value?.pause?.(); } catch { /* ignore */ }
    } else if (isVideo()) {
        videoRef.value?.pause();
    }
}

// 视口进入 → 播一次；离开 → 暂停（视口外不播放）
onMounted(() => {
    const el = rootEl.value;
    if (!el) return;
    onVisibilityChange(
        el,
        () => {
            inView.value = true;
            playOnce();
        },
        () => {
            inView.value = false;
            pauseAnim();
        },
    );
});

onUnmounted(() => {
    unobserveVisibility(rootEl.value);
});

// 媒体就绪晚于进入视口时，补播一次
watch(() => state.ready, (ready) => {
    if (ready && inView.value) playOnce();
});
</script>

<style scoped>
.reac-anim-media {
    display: block;
    max-width: 100%;
    max-height: 100%;
}
</style>
