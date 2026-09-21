<template>
    <span class="reac-anim flex items-center justify-center w-full h-full overflow-hidden select-none" :title="emoji">
        <!-- 动态反应动画（对齐 Unigram：getEmojiReaction → select/activate animation） -->
        <TgsPlayer v-if="state.ready && state.format === 'tgs' && state.tgsSrc" :src="state.tgsSrc" :loop="true"
            :autoplay="true" :size="mediaSize" class="reac-anim-media" />
        <video v-else-if="state.ready && (state.format === 'webm' || state.format === 'mpeg4') && state.src"
            :src="state.src" autoplay loop muted playsinline class="reac-anim-media object-contain"
            :style="mediaBoxStyle" />
        <img v-else-if="state.ready && state.format === 'webp' && state.src" :src="state.src" draggable="false"
            class="reac-anim-media object-contain" :style="mediaBoxStyle" />
        <!-- 加载失败 / 未就绪：静态 emoji 兜底 -->
        <span v-else class="leading-none" :style="{ fontSize: fallbackFontSize + 'px', lineHeight: '1' }">{{ emoji }}</span>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TgsPlayer from './TgsPlayer.vue';
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

const mediaSize = computed(() => props.size);
const mediaBoxStyle = computed(() =>
    props.size != null
        ? { width: `${props.size}px`, height: `${props.size}px` }
        : { width: '100%', height: '100%' },
);
const fallbackFontSize = computed(() =>
    props.fallbackFont ?? (props.size != null ? Math.max(12, props.size - 2) : 18),
);
</script>

<style scoped>
.reac-anim-media {
    display: block;
    max-width: 100%;
    max-height: 100%;
}
</style>
