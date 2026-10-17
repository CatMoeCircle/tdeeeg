<template>
    <!-- 单色 emoji 图标：用 emoji 静态图/缩略图作 alpha 蒙版，填充当前文字颜色 -->
    <span class="inline-block shrink-0 bg-current" :style="style" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useCustomEmoji, requestCustomEmoji } from '../../../../../store/customEmoji';

/**
 * 按钮内的图标跟随按钮文字颜色（不是 emoji 原色）。
 * 做法：拿自定义 emoji 的静态图（webp/gif 本体，或官方缩略图）当 CSS mask，
 * 背景填充 currentColor —— 形状保留，颜色与文字一致。动画格式（tgs/webm）
 * 不能作蒙版，自动退回缩略图；两者都没有时用低透明度色块打底。
 */
const props = withDefaults(defineProps<{ emojiId: string; size?: number }>(), { size: 18 });

const state = ref(useCustomEmoji(props.emojiId, false));

onMounted(() => requestCustomEmoji(props.emojiId));

watch(() => props.emojiId, (id) => {
    state.value = useCustomEmoji(id, false);
    requestCustomEmoji(id);
});

/** 蒙版源：优先本地静态完整图，其次官方缩略图 */
const maskUrl = computed(() => {
    const s = state.value;
    const fmt = s.sticker?.format._;
    if (s.ready && s.filePath && fmt === 'stickerFormatWebp') return s.filePath;
    return s.thumbnailUrl ?? '';
});

const style = computed((): Record<string, string> => {
    const size = `${props.size}px`;
    if (!maskUrl.value) {
        // 还没图：灰色打底（currentColor 低透明度），不回退 emoji 字符
        return { width: size, height: size, opacity: '0.3' };
    }
    const url = `url("${maskUrl.value}")`;
    return {
        width: size,
        height: size,
        maskImage: url,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskImage: url,
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
    };
});
</script>
