<template>
    <template v-for="(seg, i) in segments" :key="i">
        <CustomEmojiInline v-if="seg.customEmojiId" :emojiId="seg.customEmojiId" :size="size"
            :fallback-text="seg.text" />
        <span v-else-if="seg.isSpoiler" class="fts-spoiler" :style="{ width: seg.widthPx + 'px' }"></span>
        <span v-else>{{ seg.text }}</span>
    </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { formattedText } from 'tdlib-types';
import CustomEmojiInline from './ChatDetail/MessageContent/CustomEmojiInline.vue';

const props = defineProps<{
    /** 需要渲染的富文本；为空时不渲染任何内容 */
    formattedText?: formattedText | null;
    /** 自定义 emoji 尺寸（px） */
    size?: number;
}>();

const size = computed(() => props.size || 14);

type Segment = { text: string; customEmojiId?: string; isSpoiler?: boolean; widthPx?: number };

/** 剧透遮盖块宽度：按原文长度估算（用当前字号近似），保证遮盖块与原长度大体一致 */
function spoilerWidthPx(len: number, fontSizePx: number): number {
    return Math.max(8, Math.min(160, len * fontSizePx * 0.6));
}

/**
 * 将 formattedText 按自定义 emoji + 剧透实体切分为段落。
 * - textEntityTypeCustomEmoji → 内联表情；
 * - textEntityTypeSpoiler → 剧透段（不显示原文，渲染成遮盖色块，预览不泄露内容）；
 * 其余实体按纯文本显示，适合聊天列表预览、分组标签等小尺寸场景。
 */
const segments = computed<Segment[]>(() => {
    const ft = props.formattedText;
    if (!ft || !ft.text) return [];

    const text = ft.text;
    const specialEntities = (ft.entities ?? [])
        .map(e => ({
            start: Math.max(0, Math.min(text.length, e.offset)),
            end: Math.max(0, Math.min(text.length, e.offset + e.length)),
            entity: e,
        }))
        .filter(i => i.end > i.start)
        .filter(i => i.entity.type._ === 'textEntityTypeCustomEmoji' || i.entity.type._ === 'textEntityTypeSpoiler');

    if (specialEntities.length === 0) {
        return [{ text }];
    }

    const boundaries = new Set<number>([0, text.length]);
    for (const e of specialEntities) {
        boundaries.add(e.start);
        boundaries.add(e.end);
    }
    const offsets = [...boundaries].sort((a, b) => a - b);

    return offsets.slice(0, -1).map((start, index) => {
        const end = offsets[index + 1];
        const segText = text.slice(start, end);
        const entity = specialEntities.find(e => e.start <= start && e.end >= end);
        if (entity?.entity.type._ === 'textEntityTypeCustomEmoji') {
            return {
                text: segText,
                customEmojiId: String(entity.entity.type.custom_emoji_id),
            };
        }
        if (entity?.entity.type._ === 'textEntityTypeSpoiler') {
            return { text: segText, isSpoiler: true, widthPx: spoilerWidthPx(segText.length, size.value) };
        }
        return { text: segText };
    });
});
</script>

<style>
/* 剧透文本预览：遮盖原文，不显示内容（聊天列表/预览小尺寸场景） */
.fts-spoiler {
  display: inline-block;
  vertical-align: -0.1em;
  height: 1.1em;
  background: rgba(127, 129, 133, 0.3);
  border-radius: 3px;
  user-select: none;
}
</style>
