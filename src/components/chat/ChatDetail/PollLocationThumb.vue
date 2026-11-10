<template>
    <img v-if="src" :src="src" alt="" class="h-full w-full object-cover" />
    <MapPinIcon v-else class="h-5 w-5 text-amber-500" />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { MapPin as MapPinIcon } from 'lucide-vue-next';
import type { location } from 'tdlib-types';
import { ensureLocalFilePath, tdlibSend } from '../../../utils/session/tdlib';

const props = withDefaults(defineProps<{
    location: location;
    chatId?: number;
    /** 显示尺寸；请求 2 倍图保证小方框也清晰 */
    size?: number;
}>(), { size: 48 });

const src = ref('');

let seq = 0;

watch(
    () => [props.location.latitude, props.location.longitude, props.size] as const,
    async () => {
        const current = ++seq;
        src.value = '';
        try {
            const file = await tdlibSend({
                _: 'getMapThumbnailFile',
                location: props.location,
                zoom: 14,
                width: Math.max(16, Math.round(props.size * 2)),
                height: Math.max(16, Math.round(props.size * 2)),
                scale: 1,
                chat_id: props.chatId ?? 0,
            });
            const path = await ensureLocalFilePath(file);
            if (current === seq && path) src.value = convertFileSrc(path);
        } catch {
            // 地图缩略图失败时保留定位针占位，不影响发送
        }
    },
    { immediate: true },
);
</script>
