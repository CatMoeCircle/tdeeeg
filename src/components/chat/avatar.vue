<template>
    <div :class="containerClass">
        <img v-if="avatar" :src="avatar" alt="avatar" class="w-full h-full object-cover" />
        <div v-else class="w-full h-full flex items-center justify-center text-gray-500 text-xs">{{ initials }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { chatPhotoInfo, profilePhoto } from "tdlib-types";
import { tdlibSend, } from '../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";

const props = defineProps<{
    photo?: chatPhotoInfo | profilePhoto;
    title?: string;
    sizeClass?: string;
}>();

const initials = computed(() => {
    const t = props.title || '';
    return t.substring(0, 2);
});

const containerClass = computed(() => {
    const base = 'w-full h-full rounded-full bg-gray-300 shrink-0 overflow-hidden';
    if (props.sizeClass) return ` ${props.sizeClass} ${base}`;
    return base;
});


const avatar = ref<string | undefined>(props.photo?.minithumbnail ? `data:image/jpeg;base64,${props.photo.minithumbnail.data}` : undefined);

watch(
    () => props.photo,
    async (photo) => {
        if (!photo) {
            avatar.value = undefined;
            return;
        }

        // 1️⃣ minithumbnail
        if (photo.minithumbnail) {
            avatar.value = `data:image/jpeg;base64,${photo.minithumbnail.data}`;
        }

        // 2️⃣ 已下载
        if (photo.small?.local?.is_downloading_completed) {
            avatar.value = convertFileSrc(photo.small.local.path);
            return;
        }

        // 3️⃣ 触发下载
        const file = await tdlibSend({
            _: "downloadFile",
            file_id: photo.small?.id,
            priority: 1,
            offset: 0,
            limit: 0,
            synchronous: true,
        });

        if (file.local?.path) {
            avatar.value = convertFileSrc(file.local.path);
        }
    },
    { immediate: true } // 🔥 非常重要
);

</script>