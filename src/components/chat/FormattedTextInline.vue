<template>
    <template v-for="(seg, i) in segments" :key="i">
        <CustomEmojiInline v-if="seg.customEmojiId" :emojiId="seg.customEmojiId" :size="size"
            :fallback-text="seg.text" :eager="alwaysFetch" />
        <span v-else-if="seg.isSpoiler" class="fts-spoiler" :style="{ width: seg.widthPx + 'px' }"></span>
        <template v-else>{{ seg.text }}</template>
        <!-- 按字数截断时补省略号（不能依赖 CSS ellipsis：内联子节点下 ellipsis 不生效） -->
        <template v-if="seg.truncated">…</template>
    </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { formattedText } from 'tdlib-types';
import CustomEmojiInline from '../common/CustomEmojiInline.vue';

const props = defineProps<{
    /** 需要渲染的富文本；为空时不渲染任何内容 */
    formattedText?: formattedText | null;
    /** 自定义 emoji 尺寸（px） */
    size?: number;
    /**
     * 立即拉取自定义 emoji（不走视口懒加载）。
     * 列表单行等会被复用/滚出视口的场景保持默认 false；置顶栏这类短命预览置 true。
     */
    alwaysFetch?: boolean;
    /**
     * 最大显示字数：超出后截断并补省略号（按码点计数，自定义 emoji 只占 1 个字）。
     * 顶部栏需要固定高度时用它代替 CSS truncate —— 见 PinnedMessageBar。
     */
    maxChars?: number;
}>();

const size = computed(() => props.size || 22);

type Segment = { text: string; customEmojiId?: string; isSpoiler?: boolean; widthPx?: number; truncated?: boolean };

/** 按码点截断：迭代器按码点推进，不会切开代理对（emoji 字符本身也不被裁半） */
function truncateCodePoints(text: string, max: number): { text: string; truncated: boolean } {
    const chars = Array.from(text);
    if (chars.length <= max) return { text, truncated: false };
    return { text: chars.slice(0, Math.max(0, max - 1)).join(''), truncated: true };
}

/** 剧透遮盖块宽度：按原文长度估算（用当前字号近似），保证遮盖块与原长度大体一致 */
function spoilerWidthPx(len: number, fontSizePx: number): number {
    return Math.max(8, Math.min(160, len * fontSizePx * 0.6));
}

/**
 * 将 formattedText 按自定义 emoji + 剧透实体切分为段落。
 * - textEntityTypeCustomEmoji → 内联表情；
 * - textEntityTypeSpoiler → 剧透段（不显示原文，渲染成遮盖色块，预览不泄露内容）；
 * 其余实体按纯文本显示，适合聊天列表预览、分组标签等小尺寸场景。
 *
 * alwaysFetch：预览区域（如置顶栏）不复用长驻的列表单元，离开后不会重新挂载，
 * 必须立即拉取，否则视口懒加载的 crossed 门控在卸载前可能从未触发，表情永远停在骨架。
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
        if (props.maxChars == null) return [{ text }];
        const whole = truncateCodePoints(text, props.maxChars);
        return [{ text: whole.text, truncated: whole.truncated }];
    }

    const boundaries = new Set<number>([0, text.length]);
    for (const e of specialEntities) {
        boundaries.add(e.start);
        boundaries.add(e.end);
    }
    const offsets = [...boundaries].sort((a, b) => a - b);

    // 按码点预算截断：预留 1 个字给省略号，剩余额度逐段消耗
    const limit = props.maxChars;
    let remaining = limit == null ? Infinity : Math.max(0, limit - 1);
    let overflowed = false;

    const out: Segment[] = [];
    for (let index = 0; index < offsets.length - 1; index++) {
        const start = offsets[index];
        const end = offsets[index + 1];
        const segText = text.slice(start, end);
        const entity = specialEntities.find(e => e.start <= start && e.end >= end);
        const type = entity?.entity.type;

        let piece = segText;
        if (limit != null) {
            const len = Array.from(segText).length;
            if (remaining <= 0) {
                overflowed = true;
                break;
            }
            if (len > remaining) {
                piece = truncateCodePoints(segText, remaining).text;
                overflowed = true;
            }
            remaining -= Math.min(len, remaining);
        }

        if (type?._ === 'textEntityTypeCustomEmoji') {
            out.push({ text: piece, customEmojiId: String(type.custom_emoji_id) });
        } else if (type?._ === 'textEntityTypeSpoiler') {
            out.push({ text: piece, isSpoiler: true, widthPx: spoilerWidthPx(piece.length, size.value) });
        } else {
            out.push({ text: piece });
        }

        if (overflowed) break;
    }

    if (overflowed && out.length > 0) out[out.length - 1].truncated = true;
    if (overflowed && out.length === 0) return [{ text: '', truncated: true }];
    return out;
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
