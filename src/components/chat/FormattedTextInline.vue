<template>
    <template v-for="(seg, i) in segments" :key="i">
        <CustomEmojiInline v-if="seg.customEmojiId" :emojiId="seg.customEmojiId" :size="size" />
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

type Segment = { text: string; customEmojiId?: string };

/**
 * 将 formattedText 按自定义 emoji 实体切分为段落。
 * 仅处理 textEntityTypeCustomEmoji 实体，其余实体按纯文本显示，
 * 适合聊天列表预览、分组标签等小尺寸场景。
 */
const segments = computed<Segment[]>(() => {
    const ft = props.formattedText;
    if (!ft || !ft.text) return [];

    const text = ft.text;
    const customEmojiEntities = (ft.entities ?? [])
        .map(e => ({
            start: Math.max(0, Math.min(text.length, e.offset)),
            end: Math.max(0, Math.min(text.length, e.offset + e.length)),
            entity: e,
        }))
        .filter(i => i.end > i.start)
        .filter(i => i.entity.type._ === 'textEntityTypeCustomEmoji');

    if (customEmojiEntities.length === 0) {
        return [{ text }];
    }

    const boundaries = new Set<number>([0, text.length]);
    for (const e of customEmojiEntities) {
        boundaries.add(e.start);
        boundaries.add(e.end);
    }
    const offsets = [...boundaries].sort((a, b) => a - b);

    return offsets.slice(0, -1).map((start, index) => {
        const end = offsets[index + 1];
        const segText = text.slice(start, end);
        const emojiEntity = customEmojiEntities.find(e => e.start <= start && e.end >= end);
        if (emojiEntity) {
            return {
                text: segText,
                customEmojiId: String((emojiEntity.entity.type as any).custom_emoji_id),
            };
        }
        return { text: segText };
    });
});
</script>
