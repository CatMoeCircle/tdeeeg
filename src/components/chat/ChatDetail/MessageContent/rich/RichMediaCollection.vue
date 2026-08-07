<template>
    <div v-if="items.length" class="group relative mx-auto overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700"
        :style="containerStyle" @wheel="onWheel">
        <template v-if="mode === 'grid'">
            <div v-for="item in items" :key="item.key" class="absolute overflow-hidden" :style="item.style">
                <RichImage v-if="item.file" :file="item.file" :format="item.format" :alt="item.alt" fill />
                <div v-else class="absolute inset-0 flex items-center justify-center text-gray-400">
                    图片不可用
                </div>
                <span v-if="item.isVideo" class="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <PlayIcon class="w-7 h-7 text-white drop-shadow" />
                </span>
            </div>
        </template>
        <template v-else>
            <RichImage v-if="currentItem.file" :file="currentItem.file" :format="currentItem.format"
                :alt="currentItem.alt" fill />
            <div v-else class="absolute inset-0 flex items-center justify-center text-gray-400">
                图片不可用
            </div>
            <span v-if="currentItem.isVideo"
                class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <PlayIcon class="w-10 h-10 text-white drop-shadow" />
            </span>
            <button v-if="items.length > 1" type="button"
                class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-opacity opacity-0 group-hover:opacity-100"
                aria-label="上一张" @click.stop="currentIndex = (currentIndex - 1 + items.length) % items.length">
                <ChevronLeftIcon class="w-5 h-5" />
            </button>
            <button v-if="items.length > 1" type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-opacity opacity-0 group-hover:opacity-100"
                aria-label="下一张" @click.stop="currentIndex = (currentIndex + 1) % items.length">
                <ChevronRightIcon class="w-5 h-5" />
            </button>
            <div v-if="items.length > 1"
                class="absolute bottom-2 inset-x-0 flex items-center justify-center gap-1 transition-opacity opacity-0 group-hover:opacity-100">
                <button v-for="(item, i) in items" :key="item.key" type="button"
                    class="w-1.5 h-1.5 rounded-full transition-colors"
                    :class="i === currentIndex ? 'bg-white' : 'bg-white/40 hover:bg-white/70'"
                    :aria-label="`第 ${i + 1} 张`" @click.stop="currentIndex = i" />
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PageBlock, file, ThumbnailFormat } from 'tdlib-types';
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from 'lucide-vue-next';
import RichImage from './RichImage.vue';
import { layoutMediaGroup } from '../../../../../utils/mediaGroupLayout';

const props = withDefaults(defineProps<{
    blocks: PageBlock[];
    mode?: 'grid' | 'slideshow';
}>(), {
    mode: 'grid',
});

interface MediaItem {
    key: string;
    file?: file;
    format?: ThumbnailFormat | null;
    alt: string;
    isVideo: boolean;
    width: number;
    height: number;
    style?: string;
}

function mediaItem(block: PageBlock, index: number): MediaItem | null {
    if (block._ === 'pageBlockPhoto' && block.photo?.sizes?.length) {
        const largest = block.photo.sizes.reduce((a, b) => (
            a.width * a.height > b.width * b.height ? a : b
        ));
        return {
            key: `photo-${largest.photo.id}-${index}`,
            file: largest.photo,
            format: undefined,
            alt: '',
            isVideo: false,
            width: largest.width,
            height: largest.height,
        };
    }
    if (block._ === 'pageBlockVideo' && block.video?.thumbnail?.file) {
        return {
            key: `video-${block.video.thumbnail.file.id}-${index}`,
            file: block.video.thumbnail.file,
            format: block.video.thumbnail.format,
            alt: '',
            isVideo: true,
            width: block.video.width,
            height: block.video.height,
        };
    }
    if (block._ === 'pageBlockAnimation' && block.animation?.thumbnail?.file) {
        return {
            key: `animation-${block.animation.thumbnail.file.id}-${index}`,
            file: block.animation.thumbnail.file,
            format: block.animation.thumbnail.format,
            alt: '',
            isVideo: false,
            width: block.animation.width,
            height: block.animation.height,
        };
    }
    return null;
}

const items = computed<MediaItem[]>(() => {
    const result: MediaItem[] = [];
    for (let i = 0; i < props.blocks.length; i += 1) {
        const item = mediaItem(props.blocks[i], i);
        if (item) result.push(item);
    }
    if (props.mode !== 'grid') return result;

    const layout = layoutMediaGroup(
        result.map((item) => ({ width: item.width, height: item.height })),
        340,
    );
    return result.map((item, index) => {
        const rect = layout.items[index];
        return {
            ...item,
            style: `top:${rect.y / layout.height * 100}%;left:${rect.x / layout.width * 100}%;width:${rect.width / layout.width * 100}%;height:${rect.height / layout.height * 100}%;`,
        };
    });
});

const currentIndex = ref(0);
const currentItem = computed(() => items.value[currentIndex.value] || items.value[0]);
let lastWheelAt = 0;

function onWheel(e: WheelEvent) {
    if (props.mode !== 'slideshow' || items.value.length <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastWheelAt < 250) return;
    lastWheelAt = now;
    if (e.deltaY > 0) {
        currentIndex.value = (currentIndex.value + 1) % items.value.length;
    } else if (e.deltaY < 0) {
        currentIndex.value = (currentIndex.value - 1 + items.value.length) % items.value.length;
    }
}

const containerStyle = computed(() => {
    if (!items.value.length) return {};
    if (props.mode === 'grid') {
        const layout = layoutMediaGroup(
            items.value.map((item) => ({ width: item.width, height: item.height })),
            340,
        );
        return {
            width: '340px',
            maxWidth: '100%',
            aspectRatio: `${layout.width} / ${layout.height}`,
        };
    }
    const item = currentItem.value;
    return {
        width: '340px',
        maxWidth: '100%',
        aspectRatio: `${item.width} / ${item.height}`,
    };
});
</script>
