<template>
    <!-- 地图卡片：TDLib 生成的地图缩略图，中心叠加定位针；比例取自块自身的 width/height -->
    <figure>
        <button type="button" :style="boxStyle"
            class="relative block overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800" @click="openMap">
            <img v-if="mapSrc" :src="mapSrc" alt="" class="h-full w-full select-none object-cover" />
            <!-- 定位针：红色 MapPin + 头部中心白色实心圆，针尖落在地图中心 -->
            <span class="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full items-center justify-center">
                <MapPinIcon class="h-10 w-10 fill-red-500 text-red-500" />
                <span class="absolute h-3.5 w-3.5 rounded-full bg-white" style="top: 9px;"></span>
            </span>
        </button>
        <RichCaption v-if="caption" :caption="caption" />
    </figure>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { location, pageBlockCaption } from 'tdlib-types';
import { MapPinIcon } from 'lucide-vue-next';
import { ensureLocalFilePath, tdlibSend } from '../../../../../utils/tdlib';
import { mediaSizeStyle } from '../../../../../utils/fitMediaSize';
import { confirmAndOpenExternalLink } from '../../../../../utils/openExternalLink';
import RichCaption from './RichCaption.vue';

const props = withDefaults(defineProps<{
    location: location;
    /** 地图缩放级别（TDLib 限定 13-20，富文本块自带） */
    zoom?: number;
    /** 块的原始像素宽高：决定卡片比例与最大显示宽度 */
    width?: number;
    height?: number;
    caption?: pageBlockCaption | null;
    chatId?: number;
}>(), {
    zoom: 15,
    width: 320,
    height: 200,
});

/** 卡片尺寸：等比 + 最大 432 + 可随气泡收缩（与图片/视频块一致） */
const boxStyle = computed(() => mediaSizeStyle(props.width || 320, props.height || 200));

const mapSrc = ref('');

/** 加载代次：块参数变化时丢弃过期结果，避免旧地图窜到新块上 */
let loadSeq = 0;

watch(
    () => [props.location.latitude, props.location.longitude, props.zoom, props.width, props.height] as const,
    async () => {
        const seq = ++loadSeq;
        mapSrc.value = '';
        const ratio = (props.width || 320) / (props.height || 200);
        const scale = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
        // TDLib 的 width/height 是「应用 scale 之前」的像素：按显示宽度（最大 432）请求，
        // 乘 scale 后才够清晰；两边都压进 TDLib 的 16-1024 限制内，避免超过 1MB 上限
        const pxWidth = Math.min(1024, Math.max(16, Math.round(Math.min(props.width || 320, 432))));
        const pxHeight = Math.min(1024, Math.max(16, Math.round(pxWidth / ratio)));
        try {
            const file = await tdlibSend({
                _: 'getMapThumbnailFile',
                location: props.location,
                zoom: Math.min(20, Math.max(13, Math.round(props.zoom || 15))),
                width: pxWidth,
                height: pxHeight,
                scale,
                chat_id: props.chatId ?? 0,
            });
            const path = await ensureLocalFilePath(file);
            if (seq === loadSeq && path) mapSrc.value = convertFileSrc(path);
        } catch (e) {
            console.error('Load map block failed:', e);
        }
    },
    { immediate: true },
);

/** 点击地图：外部打开 Google 地图搜索该坐标（外链需先确认） */
function openMap() {
    const { latitude, longitude } = props.location;
    void confirmAndOpenExternalLink(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`)
        .catch(() => { /* 用户取消 */ });
}
</script>
