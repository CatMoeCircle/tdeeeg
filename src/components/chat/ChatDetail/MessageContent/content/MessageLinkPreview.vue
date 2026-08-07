<template>
    <!-- Sticker 链接预览：左侧主题条纹 + 图像占满剩余区域（无"查看"按钮），点击打开原链接 -->
    <div v-if="isSticker" role="link" tabindex="0"
        class="my-1.5 flex items-stretch overflow-hidden rounded-lg bg-black/[0.04] dark:bg-white/[0.08]"
        @click="emit('open', preview.url)" @keydown.enter.prevent="emit('open', preview.url)"
        @keydown.space.prevent="emit('open', preview.url)">
        <div class="w-0.5 shrink-0 rounded-full" :style="accentBarStyle"></div>
        <div class="min-w-0 flex-1">
            <LinkPreviewMedia :preview="preview" large contain />
            <div v-if="preview.site_name || preview.title || preview.author || preview.description?.text"
                class="space-y-0.5 px-2.5 py-2">
                <div v-if="preview.site_name" class="truncate text-xs font-semibold" :style="accentTextStyle">
                    {{ preview.site_name }}
                </div>
                <div v-if="preview.title" class="text-sm font-semibold leading-5">{{ preview.title }}</div>
                <div v-if="preview.author" class="truncate text-xs opacity-65">{{ preview.author }}</div>
                <div v-if="preview.description?.text"
                    class="preview-description mt-0.5 whitespace-pre-wrap text-sm leading-5">
                    <FormattedTextInline :formattedText="preview.description" :size="18" />
                </div>
            </div>
        </div>
    </div>

    <!-- 普通链接预览 -->
    <div v-else class="my-1.5 overflow-hidden rounded-lg bg-black/[0.04] dark:bg-white/[0.08]" role="link" tabindex="0"
        @click="emit('open', preview.url)" @keydown.enter.prevent="emit('open', preview.url)"
        @keydown.space.prevent="emit('open', preview.url)">
        <!-- 大图媒体：位于描述上方 -->
        <LinkPreviewMedia v-if="showLarge && mediaAbove" :preview="preview" large />

        <div class="flex gap-2 px-2.5 pt-2.5 pb-2">
            <div class="w-0.5 shrink-0 rounded-full" :style="accentBarStyle"></div>

            <div class="min-w-0 flex-1">
                <div v-if="preview.site_name" class="truncate text-xs font-semibold" :style="accentTextStyle">
                    {{ preview.site_name }}
                </div>
                <div v-if="preview.title" class="mt-0.5 text-sm font-semibold leading-5">
                    {{ preview.title }}
                </div>
                <div v-if="preview.author" class="mt-0.5 truncate text-xs opacity-65">
                    {{ preview.author }}
                </div>
                <div v-if="preview.description?.text"
                    class="preview-description mt-1.5 whitespace-pre-wrap text-sm leading-5">
                    <FormattedTextInline :formattedText="preview.description" :size="18" />
                </div>
            </div>

            <!-- 小图媒体：右侧缩略图 -->
            <LinkPreviewMedia v-if="!showLarge" :preview="preview" />
        </div>

        <!-- 大图媒体：位于描述下方 -->
        <LinkPreviewMedia v-if="showLarge && !mediaAbove" :preview="preview" large />

        <button type="button"
            class="block w-[calc(100%-1.25rem)] mx-2.5 border-t border-black/10 py-2 text-center text-sm font-medium transition-colors hover:opacity-80 dark:border-white/10"
            :style="accentTextStyle" @click.stop="emit('open', preview.url)">
            查看
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { linkPreview } from 'tdlib-types';
import FormattedTextInline from '../../../FormattedTextInline.vue';
import LinkPreviewMedia from './LinkPreviewMedia.vue';
import { useColors, rgbToCss } from '../../../../../store/colors';

const props = defineProps<{
    preview: linkPreview;
    accentColorId?: number;
}>();

const emit = defineEmits<{
    open: [url: string];
}>();

const showLarge = computed(() => props.preview.show_large_media);
const mediaAbove = computed(() => props.preview.show_media_above_description);

/** 是否为 Sticker 链接预览：用「左侧主题条纹 + 图像」卡片替代"查看"按钮 */
const isSticker = computed(() => props.preview.type._ === 'linkPreviewTypeSticker');

const { accentColorStyle } = useColors();

/**
 * 配色以 TDLib 返回的发送者 accent_color_id 为准；
 * 未返回时回退到默认蓝色（与色彩系统内置回退一致，而非写死 Tailwind 蓝色）。
 */
const accent = computed(() => accentColorStyle(typeof props.accentColorId === 'number' ? props.accentColorId : 5));

/** 左色条：TDLib accent 单色=纯色，多色（1~3 色）=对角斜条纹，同回复栏 */
const accentBarStyle = computed(() => {
    const colors = accent.value.allColors;
    if (colors.length <= 1) return { backgroundColor: accent.value.color };
    const SEG = 5;
    const cycle = (colors.length + 1) * SEG;
    let stops = '';
    let pos = 0;
    for (let ci = colors.length - 1; ci >= 0; ci--) {
        const c = colors[ci];
        stops += `, ${rgbToCss(c)} ${pos}px, ${rgbToCss(c)} ${pos + SEG}px`;
        pos += SEG;
    }
    stops += `, transparent ${pos}px, transparent ${cycle}px`;
    return { background: `repeating-linear-gradient(-45deg${stops})` };
});

const accentTextStyle = computed(() => ({ color: accent.value.text }));
</script>

<style scoped>
.preview-description {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 8;
}
</style>
