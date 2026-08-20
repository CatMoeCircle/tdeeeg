<template>
    <Teleport to="body">
        <Transition name="md-fade">
            <div v-show="modelValue" class="fixed inset-0 z-200 flex items-center justify-center p-4"
                @mousedown.self="close">
                <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
                <div
                    class="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#1f2937] shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div
                        class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">更换头像</h3>
                        <button type="button" aria-label="关闭"
                            class="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            @click="close">
                            <XIcon class="w-4.5 h-4.5" />
                        </button>
                    </div>

                    <!-- 标签页 -->
                    <div class="px-5 pt-4 shrink-0">
                        <div class="flex items-center gap-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 w-max">
                            <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                :class="tab === 'history' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                                @click="tab = 'history'">历史头像</button>
                            <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                :class="tab === 'upload' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                                @click="tab = 'upload'">上传新照片</button>
                        </div>
                    </div>

                    <div class="flex-1 overflow-y-auto custom-scrollbar p-5">
                        <!-- 历史头像 -->
                        <template v-if="tab === 'history'">
                            <p v-if="historyLoading" class="text-sm text-gray-400 py-8 text-center">正在加载头像…</p>
                            <p v-else-if="historyItems.length === 0" class="text-sm text-gray-400 py-8 text-center">
                                暂无历史头像</p>
                            <div v-else class="grid grid-cols-4 gap-2.5">
                                <button v-for="(item, i) in historyItems" :key="item.id" type="button"
                                    class="aspect-square rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 transition-transform hover:scale-105"
                                    :class="selectedHistoryIndex === i ? 'ring-2 ring-teal-500 ring-offset-2 dark:ring-offset-gray-800' : ''"
                                    @click="selectedHistoryIndex = i">
                                    <img v-if="item.url || item.preview" :src="item.url ?? item.preview"
                                        class="w-full h-full object-cover" />
                                    <span v-else
                                        class="w-full h-full flex items-center justify-center text-gray-400 text-xs">加载中</span>
                                </button>
                            </div>
                            <button v-if="selectedHistoryIndex >= 0" type="button" @click="saveFromHistory"
                                :disabled="saving"
                                class="mt-4 w-full py-2.5 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50">
                                {{ saving ? '设置中…' : '设为头像' }}
                            </button>
                        </template>

                        <!-- 上传新照片 + 裁剪编辑器 -->
                        <template v-else>
                            <div v-if="!uploadImage" class="flex flex-col items-center py-10 gap-3">
                                <button type="button" @click="pickNewPhoto"
                                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    <ImagePlusIcon class="w-4.5 h-4.5" />
                                    选择图片
                                </button>
                                <p class="text-xs text-gray-400">支持 JPG / PNG / WEBP 等图片格式</p>
                            </div>
                            <div v-else>
                                <!-- 裁剪画布 -->
                                <div class="flex justify-center">
                                    <canvas ref="cropCanvas" width="320" height="320"
                                        class="w-64 h-64 rounded-full shadow-lg cursor-grab active:cursor-grabbing"
                                        @mousedown="onCropMouseDown" @mousemove="onCropMouseMove"
                                        @mouseup="onCropMouseUp" @mouseleave="onCropMouseUp"></canvas>
                                </div>
                                <!-- 缩放 -->
                                <div class="flex items-center gap-3 mt-4">
                                    <ZoomOutIcon class="w-4 h-4 text-gray-400 shrink-0" />
                                    <input type="range" min="1" max="4" step="0.01" v-model.number="cropZoom"
                                        class="flex-1 accent-teal-500" @input="redrawCrop" />
                                    <ZoomInIcon class="w-4 h-4 text-gray-400 shrink-0" />
                                </div>
                                <p class="text-xs text-gray-400 mt-1">拖动图片调整位置，拖动滑块调整缩放</p>
                                <button type="button" @click="saveFromUpload" :disabled="saving"
                                    class="mt-4 w-full py-2.5 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50">
                                    {{ saving ? '设置中…' : '保存为头像' }}
                                </button>
                                <button type="button" @click="resetUpload"
                                    class="mt-2 w-full py-2 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                    重新选择
                                </button>
                            </div>
                        </template>
                    </div>

                    <div v-if="currentPhotoId"
                        class="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
                        <span class="text-xs text-gray-400">当前头像</span>
                        <button type="button" @click="deleteCurrent" :disabled="saving"
                            class="text-sm text-red-500 hover:text-red-600 font-medium disabled:opacity-50">
                            {{ saving ? '处理中…' : '删除当前头像' }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>
<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue';
import { XIcon, ImagePlusIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-vue-next';
import { open } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { tempDir } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { MessagePlugin } from 'tdesign-vue-next';
import { tdlibSend } from '../../utils/tdlib';
import { downloadFileUrl } from '../../utils/profileMedia';
import type { chatPhoto, file } from 'tdlib-types';

const props = defineProps<{
    modelValue: boolean;
    /** 历史头像列表（getUserProfilePhotos） */
    photos: chatPhoto[];
    /** 当前头像 id（user.profile_photo.id），用于显示「删除当前头像」 */
    currentPhotoId?: string;
}>();
const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    changed: [];
}>();

const tab = ref<'history' | 'upload'>('history');
const historyLoading = ref(false);
const selectedHistoryIndex = ref(-1);
const saving = ref(false);

/** 历史头像展示项：优先下载后的真实图片，否则回退到 base64 缩略图 */
interface HistoryItem {
    id: string;
    /** 需要下载的主图文件 */
    file?: file;
    /** base64 缩略图预览（data URL） */
    preview?: string;
    /** 下载完成后的 asset URL */
    url?: string;
}
const historyItems = ref<HistoryItem[]>([]);

/** 上传裁剪状态 */
const uploadImage = ref<HTMLImageElement | null>(null);
const uploadPath = ref('');
const cropZoom = ref(1.2);
const cropOffsetX = ref(0);
const cropOffsetY = ref(0);
const dragging = ref(false);
let dragLastX = 0;
let dragLastY = 0;
const cropCanvas = ref<HTMLCanvasElement | null>(null);

const CANVAS_SIZE = 320;
const CIRCLE_RADIUS = 150;

function close() {
    emit('update:modelValue', false);
}

/** 当前裁剪比例（覆盖整圆的最小缩放 × zoom） */
function cropScale(): number {
    const img = uploadImage.value;
    if (!img) return 1;
    return Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight) * cropZoom.value;
}

function clampOffsets() {
    const img = uploadImage.value;
    if (!img) return;
    const scale = cropScale();
    const drawnW = img.naturalWidth * scale;
    const drawnH = img.naturalHeight * scale;
    const maxX = Math.max(0, (drawnW - CANVAS_SIZE) / 2);
    const maxY = Math.max(0, (drawnH - CANVAS_SIZE) / 2);
    cropOffsetX.value = Math.min(maxX, Math.max(-maxX, cropOffsetX.value));
    cropOffsetY.value = Math.min(maxY, Math.max(-maxY, cropOffsetY.value));
}

function redrawCrop() {
    const canvas = cropCanvas.value;
    const img = uploadImage.value;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = cropScale();
    const drawnW = img.naturalWidth * scale;
    const drawnH = img.naturalHeight * scale;
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(img, cx - drawnW / 2 + cropOffsetX.value, cy - drawnH / 2 + cropOffsetY.value, drawnW, drawnH);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function onCropMouseDown(e: MouseEvent) {
    dragging.value = true;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
}
function onCropMouseMove(e: MouseEvent) {
    if (!dragging.value) return;
    const dx = e.clientX - dragLastX;
    const dy = e.clientY - dragLastY;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    const scale = cropScale();
    cropOffsetX.value += dx / scale;
    cropOffsetY.value += dy / scale;
    clampOffsets();
    redrawCrop();
}
function onCropMouseUp() {
    dragging.value = false;
}

/** 取一张历史头像里分辨率最大的一档 */
function pickLargest(photo: chatPhoto): file | undefined {
    let best: file | undefined;
    let bestArea = 0;
    for (const s of photo.sizes) {
        if (!s.photo) continue;
        const area = s.width * s.height;
        if (area > bestArea) {
            bestArea = area;
            best = s.photo;
        }
    }
    return best;
}

/**
 * 打开弹窗后实时拉取历史头像：先用 base64 缩略图立即展示，
 * 再在后台并行下载主图，下载完成后替换为真实图片。
 */
async function loadHistory() {
    historyLoading.value = true;
    try {
        const items: HistoryItem[] = props.photos.map((p) => {
            const f = pickLargest(p);
            return {
                id: p.id,
                file: f,
                preview: p.minithumbnail ? `data:image/jpeg;base64,${p.minithumbnail.data}` : undefined,
            };
        });
        historyItems.value = items;
        await Promise.all(
            items
                .filter((item) => !!item.file)
                .map(async (item) => {
                    const url = await downloadFileUrl(item.file, `avatar_history_${item.id}.jpg`, 'avatar');
                    if (url) item.url = url;
                }),
        );
    } catch (e) {
        console.error('load history avatars failed:', e);
    } finally {
        historyLoading.value = false;
    }
}

/** 选择本地图片并载入裁剪画布 */
async function pickNewPhoto() {
    try {
        const selected = await open({
            multiple: false,
            title: '选择图片',
            filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }],
        });
        if (!selected || Array.isArray(selected)) return;
        await loadUploadImage(selected);
    } catch (e) {
        console.error('pick new photo failed:', e);
        MessagePlugin.error('选择图片失败');
    }
}

function loadUploadImage(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            uploadImage.value = img;
            uploadPath.value = path;
            cropZoom.value = 1.2;
            cropOffsetX.value = 0;
            cropOffsetY.value = 0;
            nextTick(() => redrawCrop());
            resolve();
        };
        img.onerror = () => {
            reject(new Error('图片加载失败'));
            MessagePlugin.error('图片加载失败，请换一张图片');
        };
        img.src = convertFileSrc(path);
    });
}

function resetUpload() {
    uploadImage.value = null;
    uploadPath.value = '';
    cropZoom.value = 1.2;
    cropOffsetX.value = 0;
    cropOffsetY.value = 0;
}

/** 将裁剪结果导出为临时 JPEG 文件，返回本地路径 */
async function exportCropToFile(): Promise<string> {
    const canvas = cropCanvas.value;
    if (!canvas) throw new Error('no canvas');
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('export crop failed');
    const dir = await tempDir();
    const buf = new Uint8Array(await blob.arrayBuffer());
    const path = `${dir}\\avatar_crop_${Date.now()}.jpg`.replace(/\/$/, '');
    await writeFile(path, buf);
    return path;
}

async function saveFromHistory() {
    const item = historyItems.value[selectedHistoryIndex.value];
    if (!item) return;
    saving.value = true;
    try {
        await tdlibSend({
            _: 'setProfilePhoto',
            photo: { _: 'inputChatPhotoPrevious', chat_photo_id: item.id },
        });
        MessagePlugin.success('头像已更新');
        emit('changed');
        close();
    } catch (e) {
        console.error('set profile photo from history failed:', e);
        MessagePlugin.error('设置头像失败');
    } finally {
        saving.value = false;
    }
}

async function saveFromUpload() {
    if (!uploadImage.value) return;
    saving.value = true;
    try {
        const path = await exportCropToFile();
        await tdlibSend({
            _: 'setProfilePhoto',
            photo: { _: 'inputChatPhotoStatic', photo: { _: 'inputFileLocal', path } },
        });
        MessagePlugin.success('头像已更新');
        emit('changed');
        close();
    } catch (e) {
        console.error('set profile photo from upload failed:', e);
        MessagePlugin.error('设置头像失败');
    } finally {
        saving.value = false;
    }
}

async function deleteCurrent() {
    if (!props.currentPhotoId) return;
    saving.value = true;
    try {
        await tdlibSend({ _: 'deleteProfilePhoto', profile_photo_id: props.currentPhotoId });
        MessagePlugin.success('头像已删除');
        emit('changed');
        close();
    } catch (e) {
        console.error('delete profile photo failed:', e);
        MessagePlugin.error('删除头像失败');
    } finally {
        saving.value = false;
    }
}

watch(
    () => props.modelValue,
    (visible) => {
        if (!visible) return;
        tab.value = 'history';
        selectedHistoryIndex.value = -1;
        resetUpload();
        loadHistory();
    },
);

onUnmounted(() => {
    resetUpload();
});
</script>

<style scoped>
.md-fade-enter-active,
.md-fade-leave-active {
    transition: opacity 0.18s ease;
}

.md-fade-enter-from,
.md-fade-leave-to {
    opacity: 0;
}
</style>