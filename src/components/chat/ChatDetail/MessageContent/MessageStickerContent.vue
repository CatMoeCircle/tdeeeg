<template>
    <div class="w-32 h-32">
        <img v-if="mediaSrc" :src="mediaSrc" class="w-full h-full object-contain" />
        <div v-else class="w-full h-full flex items-center justify-center text-2xl">
            {{ emoji }}
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { messageSticker } from 'tdlib-types';
import { tdlibSend } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";

const props = defineProps<{
    content: messageSticker;
}>();

const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);

const emoji = props.content.sticker.emoji || '🧩';

const loadMedia = async () => {
    const f = props.content.sticker.sticker;
    if (!f) return;

    if (f.local.is_downloading_completed) {
        mediaSrc.value = convertFileSrc(f.local.path);
    } else if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
        downloadFile(f.id);
    }
};

const downloadFile = async (fileId: number) => {
    if (isDownloading.value) return;
    isDownloading.value = true;
    try {
        const res = await tdlibSend({
            _: "downloadFile",
            file_id: fileId,
            priority: 1,
            offset: 0,
            limit: 0,
            synchronous: true
        });
        if (res.local.is_downloading_completed) {
            mediaSrc.value = convertFileSrc(res.local.path);
        }
    } catch (e) {
        console.error("Download failed", e);
    } finally {
        isDownloading.value = false;
    }
};

watch(() => props.content, () => {
    mediaSrc.value = undefined;
    loadMedia();
}, { immediate: true });
</script>
