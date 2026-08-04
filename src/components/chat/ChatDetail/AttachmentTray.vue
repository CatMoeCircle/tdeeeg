<template>
    <Transition name="att-tray">
        <div v-show="attachmentStore.items.length > 0"
            class="mb-2 mx-1 max-h-72 overflow-y-auto message-input-scrollbar rounded-xl bg-white/60 dark:bg-gray-900/50 p-2">
            <VueDraggable v-model="draggableList" :animation="150" ghost-class="att-drag-ghost" :filter="'.no-drag'"
                class="flex flex-wrap gap-2">
                <template v-for="it in draggableList" :key="it.id">
                    <div :data-att-id="it.id" :title="`${it.name} · ${formatSize(it.size)}`" :class="[
                        'group relative w-16 h-16 rounded-lg overflow-hidden shrink-0 cursor-grab active:cursor-grabbing ring-2 transition-shadow',
                        selectedId === it.id
                            ? 'ring-blue-500 ring-offset-1 dark:ring-offset-gray-900'
                            : 'ring-transparent hover:ring-gray-300 dark:hover:ring-gray-600'
                    ]" @click="selectItem(it.id)">
                        <img v-if="it.kind === 'photo' || it.kind === 'animation'" :src="previewSrc(it)"
                            draggable="false" class="w-full h-full object-cover"
                            @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
                            @click.stop="selectItem(it.id)" />
                        <video v-else-if="it.kind === 'video'" :src="previewSrc(it)" muted preload="metadata"
                            draggable="false" class="w-full h-full object-cover"
                            @click.stop="selectItem(it.id)"></video>
                        <div v-else
                            class="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                            <FileIcon class="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        </div>
                        <span v-if="it.kind === 'video'"
                            class="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
                            <svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-white">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </span>
                        <span v-if="(it.caption || '').trim()"
                            class="absolute top-0 right-0 w-3.5 h-3.5 bg-blue-500 rounded-bl-md flex items-center justify-center pointer-events-none">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                                class="w-2 h-2 text-white">
                                <path d="M4 5h16M4 12h16M4 19h10" />
                            </svg>
                        </span>
                        <button type="button" aria-label="移除附件" title="移除"
                            class="no-drag absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            @click.stop="attachmentStore.remove(it.id)">
                            <XIcon class="w-3 h-3" />
                        </button>
                        <span
                            class="absolute bottom-0.5 left-0.5 px-1 rounded bg-black/50 text-white text-[9px] leading-tight pointer-events-none">
                            {{ indexOf(it.id) }}
                        </span>
                    </div>
                </template>
            </VueDraggable>

            <div v-if="selectedItem" class="mt-2 flex items-center gap-2">
                <input v-model="selectedCaption" :placeholder="`${selectedItem.name} 的描述`"
                    class="flex-1 min-w-0 rounded-lg bg-white/80 dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                    @input="onCaptionInput" @keydown.enter.exact.prevent @keydown.enter.shift.stop />
                <span class="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">{{ selectedItem.name }}</span>
            </div>
        </div>
    </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileIcon, XIcon } from 'lucide-vue-next';
import { VueDraggable } from 'vue-draggable-plus';
import { useAttachmentStore } from '../../../store/attachment';
import type { AttachmentItem } from '../../../store/attachment';

const attachmentStore = useAttachmentStore();

function formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = bytes;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

function previewSrc(it: AttachmentItem): string {
    return convertFileSrc(it.path);
}

const selectedId = ref<string | null>(null);
const selectedCaption = ref('');

const selectedItem = computed<AttachmentItem | null>(() =>
    selectedId.value ? attachmentStore.items.find((i) => i.id === selectedId.value) ?? null : null);

function indexOf(id: string): number {
    return attachmentStore.items.findIndex((i) => i.id === id) + 1;
}

function selectItem(id: string) {
    if (selectedId.value === id) {
        selectedId.value = null;
        selectedCaption.value = '';
        return;
    }
    selectedId.value = id;
    selectedCaption.value = attachmentStore.items.find((i) => i.id === id)?.caption ?? '';
}

function onCaptionInput() {
    if (selectedId.value) {
        attachmentStore.setCaption(selectedId.value, selectedCaption.value);
    }
}

const draggableList = computed<AttachmentItem[]>({
    get: () => [...attachmentStore.items],
    set: (val) => {
        attachmentStore.items.splice(0, attachmentStore.items.length, ...val);
    },
});

watch(() => attachmentStore.items, () => {
    if (selectedId.value && !attachmentStore.items.some((i) => i.id === selectedId.value)) {
        selectedId.value = null;
        selectedCaption.value = '';
    }
}, { deep: true });
</script>

<style scoped>
.message-input-scrollbar::-webkit-scrollbar {
    width: 4px;
}

.att-tray-enter-active,
.att-tray-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.att-tray-enter-from,
.att-tray-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

.att-drag-ghost {
    opacity: 0.4;
    pointer-events: none;
}

.att-drag-ghost * {
    pointer-events: none;
}
</style>
