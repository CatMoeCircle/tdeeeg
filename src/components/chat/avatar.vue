<template>
    <div :class="containerClass">
        <img v-if="avatar" :src="avatar" alt="avatar" class="w-full h-full object-cover" />
        <div v-else class="w-full h-full flex items-center justify-center text-gray-500 text-xs">{{ initials }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
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
    const base = 'w-12 h-12 rounded-full bg-gray-300 shrink-0 overflow-hidden';
    if (props.sizeClass) return `${base} ${props.sizeClass}`;
    return base;
});


const avatar = ref<string | undefined>(props.photo?.minithumbnail ? `data:image/jpeg;base64,${props.photo.minithumbnail.data}` : undefined);

onMounted(async () => {
    if (props.photo) {
        if (props.photo.small?.local?.is_downloading_completed) {
            avatar.value = convertFileSrc(props.photo.small.local.path);
            return;
        }

        const photo = await tdlibSend({
            _: "downloadFile",
            file_id: props.photo?.small?.id,
            priority: 1,
            offset: 0,
            limit: 0,
            synchronous: true
        });

        if (photo.local?.path) {
            avatar.value = convertFileSrc(photo.local.path);
        }
    }
});

</script>