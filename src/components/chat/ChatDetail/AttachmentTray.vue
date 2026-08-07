<template>
    <Transition name="att-tray">
        <div v-show="attachmentStore.items.length > 0"
            class="mb-2 mx-1 max-h-72 overflow-y-auto message-input-scrollbar rounded-xl bg-white/60 dark:bg-gray-900/50 p-2">
            <VueDraggable v-model="draggableList" :animation="150" ghost-class="att-drag-ghost" :filter="'.no-drag'"
                class="flex flex-wrap gap-2">
                <template v-for="it in draggableList" :key="it.id">
                    <!-- ===== 卡片样式：文档 / 视频（文件图标 + 名称 + 大小 + 删除） ===== -->
                    <div v-if="isCardKind(it.kind)" :data-att-id="it.id" :title="`${it.name} · ${formatSize(it.size)}`"
                        :class="[
                            'group relative flex min-w-55 max-w-full shrink-0 items-center gap-2 rounded-lg py-1.5 pl-2 pr-1 cursor-grab active:cursor-grabbing ring-2 transition-shadow',
                            selectedId === it.id
                                ? 'ring-blue-500 ring-offset-1 dark:ring-offset-gray-900'
                                : 'ring-transparent hover:ring-gray-300 dark:hover:ring-gray-600'
                        ]" @click="selectItem(it.id)">
                        <span
                            class="relative shrink-0 flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700">
                            <img v-if="it.cover" :src="previewSrcOf(it.cover)" draggable="false"
                                class="h-full w-full object-cover" />
                            <component v-else :is="it.kind === 'video' ? VideoIcon : (it.kind === 'audio' ? MusicIcon : FileIcon)"
                                class="h-5 w-5 text-gray-500 dark:text-gray-400" />
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-xs font-medium text-gray-800 dark:text-gray-200">{{ it.name }}</span>
                            <span class="block truncate text-[11px] text-gray-400 dark:text-gray-500">{{ formatSize(it.size) }}</span>
                        </span>
                        <span v-if="(it.caption || '').trim()"
                            class="shrink-0 flex h-3.5 w-3.5 items-center justify-center rounded bg-blue-500"
                            title="该文件设置了描述">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                                class="h-2 w-2 text-white">
                                <path d="M4 5h16M4 12h16M4 19h10" />
                            </svg>
                        </span>
                        <button type="button" aria-label="移除附件" title="移除"
                            class="no-drag shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:text-red-500 transition-colors"
                            @click.stop="attachmentStore.remove(it.id)">
                            <XIcon class="h-4 w-4" />
                        </button>
                        <span
                            class="absolute -top-1 -left-1 px-1 rounded bg-blue-500 text-white text-[9px] leading-tight pointer-events-none">
                            {{ indexOf(it.id) }}
                        </span>
                    </div>

                    <!-- ===== 方块样式：图片 / 动画 / 音频 ===== -->
                    <div v-else :data-att-id="it.id" :title="`${it.name} · ${formatSize(it.size)}`" :class="[
                        'group relative w-16 h-16 rounded-lg overflow-hidden shrink-0 cursor-grab active:cursor-grabbing ring-2 transition-shadow',
                        selectedId === it.id
                            ? 'ring-blue-500 ring-offset-1 dark:ring-offset-gray-900'
                            : 'ring-transparent hover:ring-gray-300 dark:hover:ring-gray-600'
                    ]" @click="selectItem(it.id)">
                        <img v-if="it.kind === 'photo' || it.kind === 'animation'" :src="previewSrc(it)"
                            draggable="false" class="w-full h-full object-cover"
                            @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
                            @click.stop="selectItem(it.id)" />
                        <div v-else
                            class="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                            <MusicIcon class="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        </div>
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

            <div v-if="selectedItem" class="mt-2 flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <input v-model="selectedCaption" :placeholder="`${selectedItem.name} 的描述`"
                        class="flex-1 min-w-0 rounded-lg bg-white/80 dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                        @input="onCaptionInput" @keydown.enter.exact.prevent @keydown.enter.shift.stop />
                    <span class="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">{{ selectedItem.name }}</span>
                </div>
                <!-- 封面设置（仅卡片类：文档 / 视频 / 音频） -->
                <div v-if="isCardKind(selectedItem.kind)" class="flex items-center gap-2">
                    <span
                        class="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700">
                        <img v-if="selectedItem.cover" :src="previewSrcOf(selectedItem.cover)" draggable="false"
                            class="h-full w-full object-cover" />
                        <span v-else class="flex h-full w-full items-center justify-center">
                            <ImageIcon class="h-4 w-4 text-gray-400 dark:text-gray-500" />
                        </span>
                    </span>
                    <button type="button"
                        class="rounded-lg bg-white/80 dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        @click="pickCover">
                        {{ selectedItem.cover ? '更改封面' : '添加封面' }}
                    </button>
                    <button v-if="selectedItem.cover" type="button"
                        class="rounded-lg bg-white/80 dark:bg-gray-800 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        @click="removeCover">
                        移除封面
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileIcon, ImageIcon, MusicIcon, VideoIcon, XIcon } from 'lucide-vue-next';
import { VueDraggable } from 'vue-draggable-plus';
import { useAttachmentStore } from '../../../store/attachment';
import type { AttachmentItem, AttachmentKind } from '../../../store/attachment';

const attachmentStore = useAttachmentStore();

/** 是否为卡片样式附件（文档 / 视频 / 音频）：图标 + 文件名 + 大小 + 删除，而非方形缩略图 */
function isCardKind(kind: AttachmentKind): boolean {
    return kind === 'document' || kind === 'video' || kind === 'audio';
}

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

/** 任意本地路径转预览 URL（封面等） */
function previewSrcOf(path: string): string {
    return convertFileSrc(path);
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

/** 为当前选中附件选择封面图片（本地路径写入 store.cover） */
async function pickCover() {
    if (!selectedId.value) return;
    try {
        const selected = await open({
            multiple: false,
            title: '选择封面图片',
            filters: [{
                name: '图片',
                extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'],
            }],
        });
        if (!selected || Array.isArray(selected)) return;
        attachmentStore.setCover(selectedId.value, selected);
    } catch {
        // 静默
    }
}

/** 移除当前选中附件的封面 */
function removeCover() {
    if (!selectedId.value) return;
    attachmentStore.setCover(selectedId.value, null);
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
